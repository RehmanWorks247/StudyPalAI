import { useState } from 'react';
import { Icon } from './icons';
import { SetHeading, StudyWidgets } from './dashboard';
import type { DialogName, StudySet, View } from './demo-data';
import { scheduledDate, type planTopics } from './plan-topics';
import type { Plan } from './workspace-storage';

interface PlanProps {
  studySet: StudySet;
  topics: ReturnType<typeof planTopics>;
  covered: string[];
  plans: Plan[];
  onClone: () => void;
  onRead: (name: string) => void;
  onReview: (id: string) => void;
  onTopic: (view: View, topic: { source: string; title: string }) => void;
  onDialog: (dialog: DialogName) => void;
}

export function StudyPlan({
  studySet,
  topics,
  covered,
  plans,
  onClone,
  onRead,
  onReview,
  onTopic,
  onDialog,
}: PlanProps) {
  const [planName, setPlanName] = useState(plans.at(-1)?.name ?? '');
  const [filter, setFilter] = useState('All topics');
  const [sort, setSort] = useState('Material');
  const active = plans.find((plan) => plan.name === planName);
  const ordered = topics
    .map((topic, index) => ({
      ...topic,
      done: covered.includes(topic.id),
      date: active ? scheduledDate(active.start, active.date, index, topics.length) : '',
    }))
    .filter((topic) => filter === 'All topics' || (filter === 'Covered' ? topic.done : !topic.done))
    .sort((a, b) =>
      sort === 'Topic'
        ? a.title.localeCompare(b.title)
        : sort === 'Progress'
          ? Number(a.done) - Number(b.done)
          : 0,
    );
  const done = topics.filter((topic) => covered.includes(topic.id)).length;
  return (
    <div className="study-plan">
      <SetHeading
        name={studySet.name}
        compact
        onSettings={() => onDialog('settings')}
        onClone={onClone}
      />
      <div className="plan-tabs">
        <button className={!active ? 'active' : ''} onClick={() => setPlanName('')}>
          All topics
        </button>
        {plans.map((plan) => (
          <button
            key={plan.name}
            className={active === plan ? 'active' : ''}
            onClick={() => setPlanName(plan.name)}
          >
            {plan.name}
          </button>
        ))}
        <button className="sp-button white" onClick={() => onDialog('new-plan')}>
          <Icon name="plus" />
          New plan
        </button>
      </div>
      <div className="plan-columns">
        <div>
          <div className="plan-toolbar">
            <label>
              Sort by{' '}
              <select
                aria-label="Sort study plan"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                {['Material', 'Topic', 'Progress'].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Show{' '}
              <select
                aria-label="Filter study plan"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {['All topics', 'Not started', 'Covered'].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
          {active && (
            <p className="plan-schedule">
              {active.mode} · Target {active.date}
            </p>
          )}
          {ordered.map((topic) => (
            <section key={topic.id} className="path-unit plan-step">
              <small>
                {topic.source}
                {topic.date && ' · ' + topic.date}
              </small>
              <details>
                <summary>{topic.title}</summary>
                <p>{topic.text}</p>
              </details>
              <div className="topic-tools">
                <label>
                  <input type="checkbox" checked={topic.done} onChange={() => onReview(topic.id)} />{' '}
                  Reviewed
                </label>
                <button className="sp-button white" onClick={() => onRead(topic.source)}>
                  Read source
                </button>
                <button
                  className="sp-button white"
                  onClick={() => onTopic(active?.mode === 'Cram' ? 'quiz' : 'tutor', topic)}
                >
                  {active?.mode === 'Cram' ? 'Practice' : 'Tutor Me'}
                </button>
              </div>
            </section>
          ))}
          {!ordered.length && (
            <div className="path-unit plan-step">
              <p>
                {topics.length
                  ? 'No topics match this filter.'
                  : 'Add course material to build your study plan.'}
              </p>
              {!topics.length && (
                <button className="sp-button white" onClick={() => onDialog('upload')}>
                  Add materials
                </button>
              )}
            </div>
          )}
        </div>
        <aside>
          <section className="study-widget">
            <h2>Progress</h2>
            <p>
              {done} of {topics.length} topics reviewed
            </p>
            <progress aria-label="Topics reviewed" value={done} max={Math.max(1, topics.length)} />
          </section>
          <StudyWidgets onDialog={onDialog} />
        </aside>
      </div>
    </div>
  );
}
