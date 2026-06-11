# Event Modification Specification

## ADDED Requirements

### Requirement: Reject no-op updates

The system SHALL reject an `update_event` call that supplies no mutable field
(only `eventId`, `span`, or `occurrenceDate`) with a validation error and SHALL
NOT perform a save.

#### Scenario: Update with no mutable field is rejected

- **WHEN** `update_event` is invoked with only `eventId` (and optionally `span`
  and/or `occurrenceDate`) and none of `title`, `startDate`, `endDate`,
  `timeZone`, `allDay`, `location`, `notes`, or `calendarId`
- **THEN** the system returns a validation error describing that at least one
  mutable field is required
- **AND** no save is performed on the underlying event store
