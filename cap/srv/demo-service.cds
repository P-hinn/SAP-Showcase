/**
 * Helpers for presenting the showcase. Refuses to do anything unless the app
 * runs with mocked authentication, i.e. never in a productive landscape.
 */
@path: '/demo'
@requires: 'authenticated-user'
service DemoService {

  /** Users a presenter can switch between with one click. */
  function users() returns many {
    id    : String;
    roles : many String;
  };

  /** Restores the sample data, so the demo story can be told again from the start. */
  action resetData() returns Boolean;
}
