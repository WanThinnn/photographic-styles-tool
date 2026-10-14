# Stylio — browser build

The app runs locally in the browser. Photos are never uploaded.

After cloning, run `node tools/package-ai-style-models.mjs assemble` from the repository root before serving locally. Pages deployment assembles and verifies large model parts automatically.

Documentation is maintained in `docs/`:

- [Browser setup, source structure, compatibility and performance](../docs/web/browser-guide.md)
- [Portrait and DNG processing](../docs/web/processing-guide.md)
- [AI model assets and distribution](../docs/models/ai-assets.md)
- [Mobile UI/UX redesign plan](../docs/ui-ux/plan/2026-10-14-stylio-mobile-app-redesign.md)

`app.js` starts `src/app/application.js`. Use cases live in `src/app/processing/`, result rendering in `src/ui/results/`, and domain algorithms retain their existing folders.

Maintained by Elio (WanThinnn), based on [Shalielie by nathanatgit](https://github.com/nathanatgit/Shalielie). [LICENSE.txt](LICENSE.txt) and bundled AI license notices remain in distributed outputs.
