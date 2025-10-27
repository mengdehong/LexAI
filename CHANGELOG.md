# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2025-10-27

Branch: feat/ui-improvements

- Theme mode switching (auto/light/dark) wired to user preferences; applies class-based `.dark-mode`/`.light-mode` on root and follows system preference in auto mode.
- Dark mode polish for native form controls: ensure inputs/selects/textarea and dropdown options render correctly in dark UI without changing color tokens.
- Review Center contrast tweaks in dark mode (border/shadow/opacity only, no palette change).
- Introduced minimal UI primitives for maintainability:
  - `Button` (used in topbar navigation)
  - `Input`, `Select` (form controls)
- SettingsView refactor: componentized provider form, mapping and preferences using `Input`/`Select` (logic unchanged, no color changes).

Commits:
- dd56662 chore: commit dark-mode fixes for selects and review card contrast
- 43362b7 refactor(ui): introduce minimal ui primitives (Button/Input/Select) and unify form control sizing/focus without color changes
- e4a7c5e refactor(settings): componentize provider form, mapping and preferences using Input/Select (no color changes)

