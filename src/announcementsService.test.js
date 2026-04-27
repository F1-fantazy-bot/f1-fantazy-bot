const fs = require('fs');
const path = require('path');
const os = require('os');

describe('announcementsService', () => {
  let tmpDir;
  let tmpFile;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'announcements-'));
    tmpFile = path.join(tmpDir, 'announcements.json');
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetModules();
    consoleErrorSpy.mockRestore();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function loadServiceWithFile(fileContents) {
    if (fileContents !== undefined) {
      fs.writeFileSync(tmpFile, fileContents, 'utf8');
    }
    jest.doMock('path', () => {
      const actualPath = jest.requireActual('path');

      return {
        ...actualPath,
        join: (...parts) => {
          const joined = actualPath.join(...parts);
          if (joined.endsWith(path.join('data', 'announcements.json'))) {
            return tmpFile;
          }

          return joined;
        },
      };
    });

    return require('./announcementsService');
  }

  it('returns [] and null when file is missing', () => {
    const svc = loadServiceWithFile(undefined);
    expect(svc.loadAnnouncements()).toEqual([]);
    expect(svc.getLatestAnnouncement()).toBeNull();
  });

  it('returns [] and null when file is an empty array', () => {
    const svc = loadServiceWithFile('[]');
    expect(svc.loadAnnouncements()).toEqual([]);
    expect(svc.getLatestAnnouncement()).toBeNull();
  });

  it('returns the single entry when file has one announcement', () => {
    const entry = {
      id: '2026-04-01',
      createdAt: '2026-04-01T10:00:00.000Z',
      version: 'standard',
      sinceRef: 'abc123',
      headCommit: 'def456',
      text: 'hello',
    };
    const svc = loadServiceWithFile(JSON.stringify([entry]));
    expect(svc.loadAnnouncements()).toEqual([entry]);
    expect(svc.getLatestAnnouncement()).toEqual(entry);
  });

  it('returns the newest entry by createdAt regardless of array order', () => {
    const older = {
      id: 'older',
      createdAt: '2026-04-01T10:00:00.000Z',
      version: 'standard',
      text: 'older',
    };
    const newer = {
      id: 'newer',
      createdAt: '2026-04-15T10:00:00.000Z',
      version: 'wow',
      text: 'newer',
    };
    // Place older first to verify order doesn't matter.
    const svc = loadServiceWithFile(JSON.stringify([older, newer]));
    expect(svc.getLatestAnnouncement()).toEqual(newer);

    jest.resetModules();
    const svc2 = loadServiceWithFile(JSON.stringify([newer, older]));
    expect(svc2.getLatestAnnouncement()).toEqual(newer);
  });

  it('returns [] and null when file is malformed JSON', () => {
    const svc = loadServiceWithFile('{not json');
    expect(svc.loadAnnouncements()).toEqual([]);
    expect(svc.getLatestAnnouncement()).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('returns [] when file is JSON but not an array', () => {
    const svc = loadServiceWithFile('{"id":"x"}');
    expect(svc.loadAnnouncements()).toEqual([]);
    expect(svc.getLatestAnnouncement()).toBeNull();
  });
});
