import { SetMetadata } from '@nestjs/common';

export const ENDPOINT_ACCESS = Symbol('endpoint-access');
export const PublicEndpoint = () => SetMetadata(ENDPOINT_ACCESS, 'public');
export const PairingEndpoint = () => SetMetadata(ENDPOINT_ACCESS, 'pairing');

export const ClerkSignInEndpoint = () => SetMetadata(ENDPOINT_ACCESS, 'clerk-sign-in');
