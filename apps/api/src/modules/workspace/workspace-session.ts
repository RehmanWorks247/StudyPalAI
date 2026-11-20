import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { API_CONFIG } from '../../config/configuration.module';
import type { ApiConfig } from '../../config/env';
import { ClerkBindings, clerkBindingSeconds } from './clerk-bindings';
import { ClerkVerifier, type ClerkIdentity } from './clerk-verifier';
import { ENDPOINT_ACCESS } from '../../platform/http/endpoint-access';

const cookieName = 'studypal_session';
const sessionDuration = 8 * 60 * 60 * 1000;
const maximumSessions = 32;
const sessionProperty = Symbol('workspace-session');

interface Session {
  ownerId: string;
  csrfToken: string;
  expires: number;
}
const principalProperty = Symbol('verified-clerk-session');
type LocalRequest = FastifyRequest & {
  [sessionProperty]?: Pick<Session, 'ownerId' | 'csrfToken'>;
  [principalProperty]?: ClerkIdentity;
};
function cookie(request: FastifyRequest, name: string): string | undefined {
  const values = request.headers.cookie
    ?.split(';')
    .map((piece) => piece.trim())
    .filter((piece) => piece.startsWith(name + '='));
  // Reject ambiguous cookies with the same name and different domain or path scopes.
  return values?.length === 1 ? values[0]?.slice(name.length + 1) : undefined;
}
function sessionCookie(token: string, duration: number) {
  return (
    cookieName +
    '=' +
    token +
    '; Path=/api/v1; HttpOnly; Secure; SameSite=Strict; Max-Age=' +
    duration
  );
}
function checkCsrf(request: FastifyRequest, expected: string) {
  const supplied = request.headers['x-studypal-csrf'];
  if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(expected)))
    throw new ForbiddenException();
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
function sessionFrom(context: ExecutionContext) {
  const session = context.switchToHttp().getRequest<LocalRequest>()[sessionProperty];
  if (!session) throw new UnauthorizedException();
  return session;
}
export const WorkspaceOwner = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => sessionFrom(context).ownerId,
);
export const SessionCsrfToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => sessionFrom(context).csrfToken,
);

@Injectable()
export class WorkspaceSessions implements CanActivate {
  private readonly sessions = new Map<string, Session>();
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly reflector: Reflector,
    private readonly verifier: ClerkVerifier,
    private readonly bindings: ClerkBindings,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const access = this.reflector.getAllAndOverride<string>(ENDPOINT_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access === 'public') return true;
    const request = context.switchToHttp().getRequest<LocalRequest>();
    const origin = request.headers.origin;
    const mutation = !['GET', 'HEAD'].includes(request.method);
    if (
      (mutation || origin !== undefined) &&
      (!origin || !this.config.CORS_ORIGINS.includes(origin))
    )
      throw new ForbiddenException();
    if (this.config.WORKSPACE_AUTH_MODE === 'clerk') {
      if (access === 'pairing') throw new ForbiddenException();
      const authorization = request.headers.authorization;
      const token =
        authorization !== undefined
          ? /^Bearer ([^ ]+)$/.exec(authorization)?.[1]
          : access === 'clerk-sign-in'
            ? undefined
            : cookie(request, '__session');
      const identity = await this.verifier.verify(token, origin);
      request[principalProperty] = identity;
      if (access === 'clerk-sign-in') return true;
      const opaque = cookie(request, cookieName);
      if (!opaque || !/^[A-Za-z0-9_-]{43}$/.test(opaque)) throw new UnauthorizedException();
      const session = await this.bindings.session(identity, opaque);
      if (mutation) checkCsrf(request, session.csrfToken);
      request[sessionProperty] = session;
      return true;
    }
    if (access === 'clerk-sign-in') throw new ForbiddenException();
    if (!this.config.WORKSPACE_PAIRING_KEY || !this.config.WORKSPACE_OWNER_ID)
      throw new ServiceUnavailableException();
    const { remoteAddress } = request.raw.socket;
    if (
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress ?? '') ||
      !['localhost', '127.0.0.1', '[::1]', '::1'].includes(request.hostname)
    )
      throw new ForbiddenException();
    if (access === 'pairing') {
      const bearer = request.headers.authorization;
      if (
        !bearer ||
        !timingSafeEqual(digest(bearer), digest('Bearer ' + this.config.WORKSPACE_PAIRING_KEY))
      )
        throw new UnauthorizedException();
      return true;
    }
    const opaque = cookie(request, cookieName);
    if (!opaque || !/^[A-Za-z0-9_-]{43}$/.test(opaque)) throw new UnauthorizedException();
    const id = digest(opaque).toString('hex');
    const session = this.sessions.get(id);
    if (!session || session.expires <= Date.now()) {
      this.sessions.delete(id);
      throw new UnauthorizedException();
    }
    if (mutation) checkCsrf(request, session.csrfToken);
    request[sessionProperty] = session;
    return true;
  }

  async signIn(request: LocalRequest) {
    const identity = request[principalProperty];
    if (!identity || this.config.WORKSPACE_AUTH_MODE !== 'clerk') throw new UnauthorizedException();
    const previous = cookie(request, cookieName);
    const session = await this.bindings.exchange(
      identity,
      previous && /^[A-Za-z0-9_-]{43}$/.test(previous) ? previous : undefined,
    );
    return {
      ownerId: session.ownerId,
      expiresAt: session.expiresAt,
      csrfToken: session.csrfToken,
      cookie: sessionCookie(session.token, clerkBindingSeconds),
    };
  }
  async signOut(request: LocalRequest) {
    const token = cookie(request, cookieName);
    if (!token) throw new UnauthorizedException();
    if (this.config.WORKSPACE_AUTH_MODE === 'clerk') {
      const identity = request[principalProperty];
      if (!identity) throw new UnauthorizedException();
      await this.bindings.revoke(identity, token);
    } else this.sessions.delete(digest(token).toString('hex'));
    return sessionCookie('', 0);
  }
  pair(): { cookie: string; csrfToken: string } {
    const ownerId = this.config.WORKSPACE_OWNER_ID;
    if (!ownerId) throw new ServiceUnavailableException();
    const now = Date.now();
    for (const [id, session] of this.sessions) if (session.expires <= now) this.sessions.delete(id);
    // Only a holder of the local pairing key can create a session and evict an older device session.
    if (this.sessions.size >= maximumSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest) this.sessions.delete(oldest);
    }
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    this.sessions.set(digest(token).toString('hex'), {
      ownerId,
      csrfToken,
      expires: now + sessionDuration,
    });
    return {
      cookie: sessionCookie(token, sessionDuration / 1000),
      csrfToken,
    };
  }
}
