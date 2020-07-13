import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';

import { runCommandSync } from '../src/utils';
import { AdditionalOptions } from '../lib/index';
import mkdirp = require('mkdirp');

export interface Fixture {
  fixtureName: string;
  fileExtension: string;
  /**
   * Optional, there will not be an `initial` file if we are testing
   * a brand new file in the git index
   */
  initialContents: string | null;
  /**
   * The file as it stands after `git add`, but before formatting
   */
  stagedContents: string;
  committed: boolean;
  /**
   * Optional prettier config overrides specified inline in the
   * fixture directory
   */
  customPrettierConfig: CustomPrettierConfig | null;
}

interface CustomPrettierConfig {
  filename: string;
  contents: string;
}

class TmpFile {
  name: string;
  filename: string;
  directoryPath: string;
  initialContents?: string;
  stagedContents: string;
  committed: boolean;
  initialCommitSHA: string | null;
  updatedCommitSHA: string | null;
  path: string;
}

export class TestBed {
  private static readonly TMP_DIRECTORY_PATH = join(process.cwd(), 'tmp');
  private TEST_BED_DIRECTORY_PATH: string;
  private fixtureToTmpFile = new Map<Fixture, TmpFile>();

  constructor() {
    this.createUniqueDirectoryForTestBed();
  }

  getTmpFileForFixture(fixture: Fixture): TmpFile {
    return this.fixtureToTmpFile.get(fixture);
  }

  prepareFixtureInTmpDirectory(fixture: Fixture): void {
    /**
     * Create and cache a TmpFile for the given Fixture
     */
    const tmpFile = this.createTmpFileForFixture(fixture);
    this.fixtureToTmpFile.set(fixture, tmpFile);
    /**
     * Initialise a .git directory for the fixture
     */
    mkdirp.sync(tmpFile.directoryPath);
    runCommandSync('git', ['init'], tmpFile.directoryPath);
    /**
     * Apply the two different file contents to the TmpFile
     */
    this.applyInitialAndStagedContentsOnDisk(tmpFile);
    /**
     * Apply any custom prettier config if present
     */
    this.applyCustomPrettierConfig(tmpFile, fixture.customPrettierConfig);
  }

  private createUniqueDirectoryForTestBed(): void {
    const dir = this.generateUniqueDirectoryName();
    this.TEST_BED_DIRECTORY_PATH = join(TestBed.TMP_DIRECTORY_PATH, dir);
    mkdirp.sync(this.TEST_BED_DIRECTORY_PATH);
  }

  private generateUniqueDirectoryName(): string {
    return randomBytes(20).toString('hex');
  }

  private applyInitialAndStagedContentsOnDisk(tmpFile: TmpFile): void {
    /**
     * If we editing an existing `initial` file, we need to first create
     * it and commit it
     */
    if (tmpFile.initialContents) {
      this.createAndCommitTmpFileOnDisk(tmpFile);
    }
    this.stageGivenChangesToTmpFileOnDisk(tmpFile);
    if (tmpFile.committed) {
      runCommandSync(
        'git',
        ['commit', '-m', `committing updates to ${tmpFile.path}]`],
        tmpFile.directoryPath,
      );
      tmpFile.updatedCommitSHA = runCommandSync(
        'git',
        ['rev-parse', 'HEAD'],
        tmpFile.directoryPath,
      ).stdout.trim();
    }
  }

  private createTmpFileForFixture(fixture: Fixture): TmpFile {
    const name = fixture.fixtureName;
    const filename = `${name}${fixture.fileExtension}`;
    const directoryPath = join(this.TEST_BED_DIRECTORY_PATH, name);
    return {
      name,
      filename,
      directoryPath,
      path: join(directoryPath, filename),
      initialContents: fixture.initialContents,
      stagedContents: fixture.stagedContents,
      committed: fixture.committed,
      initialCommitSHA: null,
      updatedCommitSHA: null,
    };
  }

  private applyCustomPrettierConfig(
    tmpFile: TmpFile,
    customPrettierConfig: CustomPrettierConfig | null,
  ): void {
    if (!customPrettierConfig) {
      return;
    }
    writeFileSync(
      join(tmpFile.directoryPath, customPrettierConfig.filename),
      customPrettierConfig.contents,
    );
  }

  private createAndCommitTmpFileOnDisk(tmpFile: TmpFile): void {
    writeFileSync(tmpFile.path, tmpFile.initialContents);
    runCommandSync('git', ['add', tmpFile.path], tmpFile.directoryPath);
    runCommandSync(
      'git',
      ['commit', '-m', `adding initial contents for ${tmpFile.path}`],
      tmpFile.directoryPath,
    );
    if (tmpFile.committed) {
      tmpFile.initialCommitSHA = runCommandSync(
        'git',
        ['rev-parse', 'HEAD'],
        tmpFile.directoryPath,
      ).stdout.trim();
    }
  }

  private stageGivenChangesToTmpFileOnDisk(tmpFile: TmpFile): void {
    writeFileSync(tmpFile.path, tmpFile.stagedContents);
    runCommandSync('git', ['add', tmpFile.path], tmpFile.directoryPath);
  }
}

export function readFixtures(): Fixture[] {
  const fixturesDirPath = join(process.cwd(), 'test', 'fixtures');
  const fixtures = readdirSync(fixturesDirPath);
  return fixtures.map(name => {
    const fixtureDirPath = join(fixturesDirPath, name);
    const files = readdirSync(fixtureDirPath);
    /**
     * Could have any of the file extensions supported by prettier
     */
    const initialContentsFileName = files.find(f => !!f.match(/initial/));
    const stagedContentsFileName = files.find(f => !!f.match(/staged/));
    const committedContentsFileName = files.find(f => !!f.match(/committed/));
    const prettierConfigFileName = files.find(f => !!f.match(/prettierrc/));

    if (!stagedContentsFileName && !committedContentsFileName) {
      throw new Error(
        `"staged" or "committed" file missing for fixture: ${fixtureDirPath}`,
      );
    }

    if (stagedContentsFileName && committedContentsFileName) {
      throw new Error(
        `"staged" and "committed" files cannot be used together - fixture: ${fixtureDirPath}`,
      );
    }

    return {
      fixtureName: name,
      fileExtension: extname(
        stagedContentsFileName || committedContentsFileName,
      ),
      initialContents: !initialContentsFileName
        ? null
        : readFileSync(join(fixtureDirPath, initialContentsFileName), 'utf8'),
      stagedContents: stagedContentsFileName
        ? readFileSync(join(fixtureDirPath, stagedContentsFileName), 'utf8')
        : readFileSync(join(fixtureDirPath, committedContentsFileName), 'utf8'),
      committed: !!committedContentsFileName,
      customPrettierConfig: !prettierConfigFileName
        ? null
        : <CustomPrettierConfig>{
            filename: prettierConfigFileName,
            contents: readFileSync(
              join(fixtureDirPath, prettierConfigFileName),
              'utf8',
            ),
          },
    };
  });
}

export function mergeOptionsForTmpFile(
  options: Partial<AdditionalOptions>,
  tmpFile: TmpFile,
): AdditionalOptions {
  const shaOptions = tmpFile.committed
    ? {
        base: tmpFile.initialCommitSHA,
        head: tmpFile.updatedCommitSHA,
      }
    : { base: null, head: null };

  return <AdditionalOptions>{
    ...options,
    ...shaOptions,
  };
}
