# Real-device QA

This checklist records optional manual evidence for future releases and support investigations. It is not a substitute for the automated browser matrix, and an unrecorded row must not be described as passed.

For each session, record the device, OS, browser version, date, tester, and result:

- iPhone Safari;
- Android Chrome;
- desktop Chrome; and
- desktop Safari.

Verify:

- slow horizontal drag, fast flick, pause before release, reversal, cancellation, and wrong-direction resistance;
- vertical dismissal where it does not conflict with primary scrolling;
- button taps, link navigation, dragging from a button or link, and release-click suppression;
- input, textarea, select, contenteditable, and `data-drag-dismiss-ignore` interaction;
- scrolling-feed coexistence, RTL, reduced motion, and browser-edge behavior;
- resize during a gesture, snap-back re-grab, repeated gestures, and committed departure; and
- consumer `transform` composition during translation.

Record qualitative motion continuity for a slow release and a fast flick. Do not infer physical iOS behavior from desktop WebKit.

## 1.0.0 evidence status

- Physical iOS testing: not performed.
- Physical Android testing: not performed.
- Human screen-reader testing: not performed.
- Automated desktop Chromium, Firefox, and WebKit: covered by CI.

Consumers must provide an ordinary semantic control for dismissal. The drag gesture is a pointer enhancement, not a keyboard or assistive-technology interaction by itself.
