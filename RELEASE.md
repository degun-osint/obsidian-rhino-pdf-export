# Guide de release

## Prérequis

- ESLint clean : `npx eslint src/`
- Build OK : `npm run build`

## Étapes

1. Bumper la version dans `manifest.json` (`"version": "X.Y.Z"`)
2. Ajouter l'entrée dans `versions.json` (`"X.Y.Z": "1.5.0"` — version min d'Obsidian)
3. Commit : `git add manifest.json versions.json && git commit -m "bump vX.Y.Z"`
4. Tag : `git tag X.Y.Z`
5. Push tout : `git push && git push origin X.Y.Z`
6. Le workflow GitHub Actions (`release.yml`) build et crée la release automatiquement

## Vérification

```bash
gh release view X.Y.Z
```

Les assets doivent contenir : `main.js`, `manifest.json`, `styles.css`.

## Mise à jour manuelle d'une release existante

```bash
npm run build
gh release upload X.Y.Z main.js --clobber
```

## Versioning

- Patch (1.0.x) : bugfix
- Minor (1.x.0) : nouvelle fonctionnalité
- Major (x.0.0) : breaking change
