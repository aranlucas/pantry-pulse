import { ArrowDown, ArrowUp, ScanLine } from "lucide-react";
import type { ReactNode } from "react";

import { formatActivitySource, formatDate, formatRfidUid } from "./format";
import { activityWasConsumed } from "./snapshot";
import type { ActivityEvent } from "./types";

export function ActivitySection({ events }: { events: ActivityEvent[] }): ReactNode {
  return (
    <section className="activity-section" aria-label="Recent scans" id="activity-view">
      <div className="activity-heading">
        <div>
          <p className="eyebrow">The paper trail</p>
          <h2>Recent scans</h2>
        </div>
        <ScanLine size={25} strokeWidth={1.6} aria-hidden="true" />
      </div>
      {events.length ? (
        <div className="activity-table" role="table" aria-label="Recent pantry scans">
          <div className="activity-table-head" role="row">
            <span role="columnheader">Event</span>
            <span role="columnheader">Item</span>
            <span role="columnheader">Source</span>
            <span role="columnheader">When</span>
          </div>
          {events.map((event) => {
            const consumed = activityWasConsumed(event.delta);
            return (
              <div className="activity-row" role="row" key={event.eventId}>
                <span
                  className={`activity-direction ${consumed ? "is-consumed" : "is-restocked"}`}
                  role="cell"
                >
                  {consumed ? (
                    <ArrowDown size={17} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <ArrowUp size={17} strokeWidth={2} aria-hidden="true" />
                  )}
                  <span className="sr-only">{consumed ? "Consumed" : "Restocked"}</span>
                </span>
                <span className="activity-item" role="cell">
                  <strong>{event.itemName}</strong>
                  <small>{formatRfidUid(event.rfidUid)}</small>
                </span>
                <span className="activity-source" role="cell">
                  {formatActivitySource(event.source)}
                </span>
                <time className="activity-time" role="cell" dateTime={event.createdAt}>
                  {formatDate(event.createdAt)}
                </time>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state activity-empty">
          <ScanLine size={28} strokeWidth={1.6} aria-hidden="true" />
          <p>Scans will appear here as the station records them.</p>
        </div>
      )}
    </section>
  );
}
