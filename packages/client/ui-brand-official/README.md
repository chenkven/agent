---
description: "agent base browser brand occupants for the sidebar and conversation hero."
kind: "package-reference"
---

# Browser brand package

English | [中文](README.zh.md)

## Summary

Show the agent base mark and name in the Web sidebar and empty conversation screen. The local and official Web builds both display this identity.

## Use this package

This package fills the sidebar mark and name slots and the empty-conversation hero mark slot with the agent base identity. It is active in local and official build profiles. The package identifier `ui-brand-official` remains for compatibility with the current Web plugin roster; the identity shown by the package is agent base.

The mark is a connected-node SVG and uses the host's requested size and CSS class. The name is text. The sidebar pair registers together; the hero registers separately so each surface can load independently. The Host entry is an empty Loader seat.

The browser title is set separately by `DSH_CLIENT_TITLE` at build time, and Web icons are in `apps/web/public`. This package does not affect model requests or provider names.

## Known Limitations and Deferred Work

- The package keeps the `ui-brand-official` identifier for compatibility with the current plugin roster. Browser title and icons are configured separately.
