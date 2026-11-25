# @epicfeed/config

Configurazione condivisa del monorepo.

- `tsconfig.base.json`: TypeScript strict (con `noUncheckedIndexedAccess` ed `exactOptionalPropertyTypes`), moduli ESM NodeNext.
- `eslint` (`createConfig`): regole `strictTypeChecked` di typescript-eslint, TSDoc obbligatoria sulle API esportate, compatibilità con Prettier.
