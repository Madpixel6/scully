import {parseAngularRoutes} from 'guess-parser';
import {join} from 'path';
import * as yargs from 'yargs';
import {scullyConfig} from '../utils/config';
import {existFolder} from '../utils/fsFolder';
import {green, logError, logWarn, yellow} from '../utils/log';

const {sge} = yargs
  .boolean('sge')
  .alias('sge', 'showGuessError')
  .describe('sb', 'dumps the error from guess to the console').argv;

export const traverseAppRoutes = async (appRootFolder = scullyConfig.projectRoot) => {
  const extraRoutes = await addExtraRoutes();
  let routes = [];
  const excludedFiles =
    scullyConfig.guessParserOptions && scullyConfig.guessParserOptions.excludedFiles
      ? scullyConfig.guessParserOptions.excludedFiles
      : [];
  try {
    let file = join(appRootFolder, 'tsconfig.app.json');
    if (!existFolder(file)) {
      file = join(appRootFolder, '../tsconfig.app.json');
    }
    if (!existFolder(file)) {
      file = join(appRootFolder, '../../tsconfig.app.json');
    }
    if (!existFolder(file)) {
      logWarn(
        `We could not find "${yellow(
          file
        )}". Using the apps source folder as source. This might lead to unpredictable results`
      );
      routes = parseAngularRoutes(appRootFolder, excludedFiles).map(r => r.path);
    } else {
      routes = parseAngularRoutes(file, excludedFiles).map(r => r.path);
    }
  } catch (e) {
    if (sge) {
      console.error(e);
    }
    logError(`
We encountered a problem while reading the routes from your applications source.
This might happen when there are lazy-loaded routes, that are not loaded,
Or when there are paths we can not resolve statically.
Check the routes in your app, rebuild and retry.
${yellow('(You can inspect the error by passing the --showGuessError flag')}

${green('When there are extraRoutes in your config, we will still try to render those.')}

`);
  }
  // process.exit(15);
  const allRoutes = [...routes, ...extraRoutes];
  if (allRoutes.findIndex(r => r.trim() === '' || r.trim() === '/') === -1) {
    /** make sure the root Route is always rendered. */
    allRoutes.push('/');
  }
  return allRoutes;
};

export async function addExtraRoutes(): Promise<string[]> {
  const isPromise = (x: any) => x && x.then !== undefined && typeof x.then === 'function';
  const extraRoutes: string | (string | Promise<string | string[]>)[] | Promise<string | string[]> =
    scullyConfig.extraRoutes;
  if (!extraRoutes) {
    return [];
  }
  if (typeof extraRoutes === 'string') {
    /** convert a simple string to an array */
    return [extraRoutes];
  }
  const workList: (string | Promise<string | string[]>)[] = [];
  if (isPromise(extraRoutes)) {
    const outerResult = await extraRoutes;
    if (typeof outerResult === 'string') {
      /** ok, we got a promise<string> return the result */
      return [outerResult];
    }
    workList.concat(outerResult);
  } else if (Array.isArray(extraRoutes)) {
    extraRoutes.forEach(r => {
      if (workList.includes(r)) {
        /** don't add duplicates */
        return;
      }
      workList.push(r);
    });
  } else {
    logWarn(`ExtraRoutes must be provided as an string array. Current type: ${typeof extraRoutes}`);
    return [];
  }

  const result: string[] = [];
  for (const route of workList) {
    /** note, this ignores non-string/non-promise things in array */
    if (typeof route === 'string') {
      result.push(route);
    }
    if (isPromise(route)) {
      const x = await route;
      if (typeof x === 'string') {
        result.push(x);
      }
      if (Array.isArray(x)) {
        x.forEach(s => {
          if (typeof s === 'string') {
            result.push(s);
          }
        });
      }
    }
  }
  return result;
}
