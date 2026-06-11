## MODIFIED Requirements

### Requirement: Search events by text

The system SHALL search events by a text query via the `search_events` tool,
matching against event title, location, and notes.

#### Scenario: Matching events are returned

- **WHEN** `search_events` is invoked with a `query`
- **THEN** the system returns events whose `title`, `location`, or `notes`
  contain the query as a case-insensitive substring

#### Scenario: Tool advertises matched fields

- **WHEN** the `search_events` tool and its `query` parameter are described to a
  client
- **THEN** both descriptions state that matching covers title, location, and
  notes (not title alone)

#### Scenario: Default search window

- **WHEN** `search_events` is invoked without `startDate` or `endDate`
- **THEN** the search window defaults to the start of the current day through 30
  days from now
