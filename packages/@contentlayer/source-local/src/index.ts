import { SourcePlugin } from '@contentlayer/core'
import * as chokidar from 'chokidar'
import { defer, fromEvent, of } from 'rxjs'
import { mergeMap, startWith, tap } from 'rxjs/operators'
import { fetch, FilePathPatternMap } from './fetchData'
import { makeCoreSchema } from './provideSchema'
import { DocumentDef, Thunk } from './schema'

export * from './schema'

type MakeSourcePlugin = (_: {
  documentDefs: Thunk<DocumentDef>[] | Record<string, Thunk<DocumentDef>>
  contentDirPath: string
}) => SourcePlugin

export const makeSourcePlugin: MakeSourcePlugin = ({ documentDefs: documentDefs_, contentDirPath }) => {
  const documentDefs = (Array.isArray(documentDefs_) ? documentDefs_ : Object.values(documentDefs_)).map((_) => _())

  return {
    provideSchema: () => makeCoreSchema({ documentDefs }),
    fetchData: ({ watch, force, previousCache }) => {
      const filePathPatternMap = documentDefs.reduce(
        (acc, documentDef) => ({ ...acc, [documentDef.name]: documentDef.filePathPattern }),
        {} as FilePathPatternMap,
      )

      const updates$ = watch
        ? defer(() =>
            fromEvent(
              chokidar.watch(contentDirPath, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200 } }),
              'all',
            ),
          ).pipe(
            tap((e) => {
              if (e && Array.isArray(e) && e.length >= 2) {
                console.log(`Watch event "${e[0]}": ${e[1]}`)
              }
            }),
            startWith(0),
          )
        : of(0)

      const data$ = of(makeCoreSchema({ documentDefs })).pipe(
        mergeMap((schemaDef) => fetch({ schemaDef, filePathPatternMap, contentDirPath, force, previousCache })),
      )

      return updates$.pipe(mergeMap(() => data$))
    },
  }
}