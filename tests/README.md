# Tests

## TDD avec résultats attendus

```bash
npm test
```

Vérifie des valeurs exactes : grille, tailles, nombre de piles, orientation canonique
des pièces 5×5 / 3×5 / 1×5, et absence d’overhang. Le cas 1×5 protège contre le
double-rotation qui produisait 270×50 au lieu de 50×270. Les cas Lite/Base vérifient
que l’empilement est bien désactivé et retombe sur des plateaux séparés ; les cas
Square vérifient que l’empilement MultiBuild reste actif.

## Matrice visuelle

`npm run test:matrix` requires the app server on http://127.0.0.1:8765 and Chrome.

It stores screenshots in `tests/out/`, then run:

```bash
python3 tools/contact-sheet.py
```

The report includes stack grid offsets and physical overhangs per layer.

Note: a `max=6` case can legitimately fail when the base plate plus border exceeds the usable bed area; that is a physical constraint, not a stack/alignment failure.
