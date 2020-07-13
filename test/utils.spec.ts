import { TestBed, readFixtures } from './test-utils';
import {
  getDiffForFile,
  resolveNearestGitDirectoryParent,
} from '../src/git-utils';
import {
  extractLineChangeData,
  calculateCharacterRangesFromLineChanges,
} from '../src/utils';

const fixtures = readFixtures();
let testBed: TestBed;

interface LineSeparator {
  name: string;
  convert: (text: string) => string;
}

const lf: LineSeparator = {
  name: 'LF',
  convert: text => text.replace(/\r?\n|\r/g, '\n'),
};

const crlf: LineSeparator = {
  name: 'CRLF',
  convert: text => text.replace(/\r?\n|\r/g, '\r\n'),
};

const cr: LineSeparator = {
  name: 'CR',
  convert: text => text.replace(/\r?\n|\r/g, '\r'),
};

describe('utils', () => {
  describe('extractLineChangeData()', () => {
    beforeAll(() => {
      testBed = new TestBed();
    });

    fixtures.forEach(fixture => {
      it(fixture.fixtureName, () => {
        testBed.prepareFixtureInTmpDirectory(fixture);
        const tmpFile = testBed.getTmpFileForFixture(fixture);
        const diff = getDiffForFile(
          resolveNearestGitDirectoryParent(tmpFile.directoryPath),
          tmpFile.path,
          tmpFile.initialCommitSHA,
          tmpFile.updatedCommitSHA,
        );
        const lineChangeData = extractLineChangeData(diff);
        expect(lineChangeData).toMatchSnapshot();
      });
    });
  });

  describe('calculateCharacterRangesFromLineChanges()', () => {
    beforeAll(() => {
      testBed = new TestBed();
    });

    fixtures.forEach(fixture => {
      it(fixture.fixtureName, () => {
        testBed.prepareFixtureInTmpDirectory(fixture);
        const tmpFile = testBed.getTmpFileForFixture(fixture);
        const diff = getDiffForFile(
          resolveNearestGitDirectoryParent(tmpFile.directoryPath),
          tmpFile.path,
          tmpFile.initialCommitSHA,
          tmpFile.updatedCommitSHA,
        );
        const lineChangeData = extractLineChangeData(diff);
        [lf, crlf, cr].forEach(lineSeparator => {
          const characterRanges = calculateCharacterRangesFromLineChanges(lineChangeData, lineSeparator.convert(fixture.stagedContents));
          expect(characterRanges).toMatchSnapshot();
        });
      });
    });
  });
});