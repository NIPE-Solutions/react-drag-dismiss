# Real-device QA

This checklist must be completed before a stable release. Automated desktop WebKit does not substitute for physical iOS Safari.

Record device, OS, browser version, date, and result for:

- iPhone Safari
- Android Chrome
- Desktop Chrome
- Desktop Safari

For each environment verify:

- slow horizontal drag, fast flick, pause before release, reversal, cancel, and wrong-direction resistance;
- vertical dismissal where it does not conflict with primary scrolling;
- button tap, link navigation, drag beginning on a button/link, and release-click suppression;
- input, textarea, select, contenteditable, and `data-drag-dismiss-ignore` interaction;
- vertical scrolling feed coexistence, RTL, reduced motion, and browser-edge behavior;
- resize during a gesture, snap-back re-grab, repeated gestures, and committed departure;
- consumer `transform` composition during translation.

Record qualitative motion continuity for both a slow release and a fast flick. Record browser and OS versions rather than inferring physical iOS behavior from desktop WebKit.

Status for `0.1.0-alpha.0`: physical iPhone and Android testing pending.
