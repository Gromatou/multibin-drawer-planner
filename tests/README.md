# Test matrix

`npm run test:matrix` requires the app server on http://127.0.0.1:8765 and Chrome.

It stores screenshots in `tests/out/`, then run:

```bash
python3 tools/contact-sheet.py
```

The report includes stack grid offsets and physical overhangs per layer.

Note: a `max=6` case can legitimately fail when the base plate plus border exceeds the usable bed area; that is a physical constraint, not a stack/alignment failure.
