import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { getDiffForFile, getStagedModifiedFiles } from './git-utils';
import {
  extractLineChangeData,
  calculateCharacterRangesFromLineChanges,
  NO_LINE_CHANGE_DATA_ERROR,
  LineChangeData,
} from './utils';
import {
  formatRangesWithinContents,
  resolvePrettierConfigForFile,
  checkRangesWithinContents,
} from './prettier';

export type ProcessingStatus = 'NOT_UPDATED' | 'UPDATED' | 'INVALID_FORMATTING';

export interface AdditionalOptions {
  checkOnly: boolean;
}

export interface Callbacks {
  onInit(workingDirectory: string): void;
  onModifiedFilesDetected(modifiedFilenames: string[]): void;
  onBegunProcessingFile(
    filename: string,
    index: number,
    totalFiles: number,
  ): void;
  onFinishedProcessingFile(
    filename: string,
    index: number,
    status: ProcessingStatus,
  ): void;
  onError(err: Error): void;
  onComplete(totalFiles: number): void;
}

function applyDefaults(options: AdditionalOptions): AdditionalOptions {
  options = options || {};
  options.checkOnly = !!options.checkOnly;
  return options;
}

/**
 * prettier-lines library
 */
export function main(
  workingDirectory: string,
  options: AdditionalOptions,
  callbacks: Callbacks = {
    onInit() {},
    onModifiedFilesDetected() {},
    onBegunProcessingFile() {},
    onFinishedProcessingFile() {},
    onError() {},
    onComplete() {},
  },
) {
  /**
   * Apply default options
   */
  const { checkOnly } = applyDefaults(options);
  try {
    callbacks.onInit(workingDirectory);

    const modifiedFilenames = getStagedModifiedFiles(workingDirectory);
    callbacks.onModifiedFilesDetected(modifiedFilenames);
    const totalFiles = modifiedFilenames.length;

    modifiedFilenames.forEach((filename, index) => {
      callbacks.onBegunProcessingFile(filename, index, totalFiles);

      const fullPath = join(workingDirectory, filename);
      const diff = getDiffForFile(fullPath);
      /**
       * Read the staged file contents
       */
      const fileContents = readFileSync(fullPath, 'utf8');
      /**
       * Extract line change data from the git diff results
       */
      let lineChangeData: LineChangeData = { additions: [], removals: [] };
      try {
        lineChangeData = extractLineChangeData(diff);
      } catch (err) {
        if (err.message === NO_LINE_CHANGE_DATA_ERROR) {
          return callbacks.onFinishedProcessingFile(
            filename,
            index,
            'NOT_UPDATED',
          );
        }
        throw err;
      }
      /**
       * Convert the line change data into character data
       */
      const characterRanges = calculateCharacterRangesFromLineChanges(
        lineChangeData,
        fileContents,
      );
      /**
       * Run prettier on the file, multiple times if required, instructing it
       * to only focus on the calculated range(s).
       *
       * If `checkOnly` is set, only check to see if the formatting is valid,
       * otherwise automatically update the formatting.
       */
      const prettierConfig = resolvePrettierConfigForFile(fullPath);
      /**
       * CHECK
       */
      if (checkOnly) {
        const isValid = checkRangesWithinContents(
          characterRanges,
          fileContents,
          prettierConfig,
        );
        if (!isValid) {
          return callbacks.onFinishedProcessingFile(
            filename,
            index,
            'INVALID_FORMATTING',
          );
        }
      }
      /**
       * FORMAT
       */
      const formattedFileContents = formatRangesWithinContents(
        characterRanges,
        fileContents,
        prettierConfig,
      );
      if (formattedFileContents === fileContents) {
        return callbacks.onFinishedProcessingFile(
          filename,
          index,
          'NOT_UPDATED',
        );
      }
      /**
       * Write the file back to disk
       */
      writeFileSync(fullPath, formattedFileContents);
      return callbacks.onFinishedProcessingFile(filename, index, 'UPDATED');
    });

    callbacks.onComplete(totalFiles);
  } catch (err) {
    callbacks.onError(err);
  }
}
