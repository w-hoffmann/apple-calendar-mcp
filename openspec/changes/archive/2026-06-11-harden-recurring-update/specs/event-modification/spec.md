## MODIFIED Requirements

### Requirement: Control the scope of recurring updates

The system SHALL support targeting a single occurrence or this-and-future
occurrences of a recurring series via the `span` and `occurrenceDate` arguments.
Targeting a recurring series SHALL require `occurrenceDate`: the system SHALL
reject a recurring-event update that omits `occurrenceDate` with a clear,
recoverable error rather than silently editing the series master or first
occurrence. `span: "future"` SHALL require `occurrenceDate`, enforced at the
bridge boundary as well as in the tool layer. `occurrenceDate` identifies the
target occurrence by its value from `get_events.occurrenceDate` (the
occurrence's original series slot), not the desired new start time; the system
SHALL select the occurrence whose `occurrenceDate` matches the supplied value.

#### Scenario: Update a single occurrence

- **WHEN** `update_event` is invoked with `span: "this"` (the default) and an
  `occurrenceDate`
- **THEN** only that occurrence of the series is changed

#### Scenario: Update this and future occurrences

- **WHEN** `update_event` is invoked with `span: "future"` and an
  `occurrenceDate`
- **THEN** that occurrence and all later occurrences are changed

#### Scenario: The occurrence identified by occurrenceDate is selected

- **WHEN** `update_event` targets a recurring series that has more than one
  occurrence resolvable within the same day window (e.g. a sub-daily series)
  with a valid `occurrenceDate`
- **THEN** the occurrence identified by `occurrenceDate` is the one modified
- **AND** other occurrences of the series are left untouched

#### Scenario: Recurring update without occurrenceDate is rejected

- **WHEN** `update_event` targets a recurring event and `occurrenceDate` is
  omitted
- **THEN** the system returns an error instead of applying the change
- **AND** no occurrence of the series is modified
- **AND** the error text instructs the caller to pass `occurrenceDate` set to
  the occurrence's value as returned by `get_events.occurrenceDate`

#### Scenario: span future without occurrenceDate is rejected

- **WHEN** `update_event` is invoked with `span: "future"` and no
  `occurrenceDate`
- **THEN** the system returns a validation error instead of applying the change
- **AND** the error text states that `occurrenceDate` is required for
  `span: "future"`
- **AND** this rejection holds whether the call arrives via the tool layer or
  directly via the bridge CLI

#### Scenario: occurrenceDate that matches no occurrence is rejected recoverably

- **WHEN** `update_event` targets a recurring event with an `occurrenceDate`
  that matches no occurrence of the series
- **THEN** the system returns an error instead of applying the change
- **AND** the error text instructs the caller to pass the exact value from
  `get_events.occurrenceDate`
- **AND** the error is distinct from a generic unknown-`eventId` failure
