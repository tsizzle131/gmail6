import { scrapeGoogleMaps } from '../../../src/agents/tools/googleMapsWrapper';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const mockedSpawn = spawn as unknown as jest.Mock;

describe('scrapeGoogleMaps', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('resolves with parsed data when CLI returns valid JSON', async () => {
    const jsonData = JSON.stringify([{ name: 'Test Place', address: '123 Main St' }]);
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProc = new EventEmitter();
    // @ts-ignore
    mockProc.stdout = mockStdout;
    // @ts-ignore
    mockProc.stderr = mockStderr;

    mockedSpawn.mockReturnValue(mockProc);

    process.nextTick(() => {
      mockStdout.emit('data', jsonData);
      mockProc.emit('close', 0);
    });

    const results = await scrapeGoogleMaps('coffee shops');
    expect(results).toEqual([{ name: 'Test Place', address: '123 Main St' }]);
    expect(mockedSpawn).toHaveBeenCalledWith('google-maps-scraper', ['-input', 'coffee shops'], { shell: true });
  });

  it('rejects when CLI returns non-zero exit code', async () => {
    const errorMsg = 'something went wrong';
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProc = new EventEmitter();
    // @ts-ignore
    mockProc.stdout = mockStdout;
    // @ts-ignore
    mockProc.stderr = mockStderr;

    mockedSpawn.mockReturnValue(mockProc);

    process.nextTick(() => {
      mockStderr.emit('data', errorMsg);
      mockProc.emit('close', 1);
    });

    await expect(scrapeGoogleMaps('coffee shops')).rejects.toThrow(
      `Google Maps scraper exited with code 1: ${errorMsg}`
    );
  });

  it('rejects when output is invalid JSON', async () => {
    const invalid = 'not-json';
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProc = new EventEmitter();
    // @ts-ignore
    mockProc.stdout = mockStdout;
    // @ts-ignore
    mockProc.stderr = mockStderr;

    mockedSpawn.mockReturnValue(mockProc);

    process.nextTick(() => {
      mockStdout.emit('data', invalid);
      mockProc.emit('close', 0);
    });

    await expect(scrapeGoogleMaps('coffee shops')).rejects.toThrow(
      'Failed to parse scraper output'
    );
  });
});
