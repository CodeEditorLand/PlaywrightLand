/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BackendClient, BackendServer } from './backend';
import { ConfigFindRelatedTestFilesReport } from './listTests';
import { TestConfig } from './playwrightTest';
import type { TestError } from './reporter';
import * as vscodeTypes from './vscodeTypes';

export class TestServerController implements vscodeTypes.Disposable {
  private _vscode: vscodeTypes.VSCode;
  private _instancePromise: Promise<TestServer | null> | undefined;
  private _instance: TestServer | null = null;
  private _envProvider: () => NodeJS.ProcessEnv;

  constructor(vscode: vscodeTypes.VSCode, envProvider: () => NodeJS.ProcessEnv) {
    this._vscode = vscode;
    this._envProvider = envProvider;
  }

  async testServerFor(config: TestConfig): Promise<TestServerInterface & TestServerEvents | null> {
    if (this._instancePromise)
      return this._instancePromise;
    this._instancePromise = this._createTestServer(config);
    return this._instancePromise;
  }

  private async _createTestServer(config: TestConfig): Promise<TestServer | null> {
    const args = [config.cli, 'test-server'];
    const testServerBackend = new BackendServer<TestServer>(this._vscode, {
      args,
      cwd: config.workspaceFolder,
      envProvider: () => {
        return {
          ...this._envProvider(),
          FORCE_COLOR: '1',
        };
      },
      clientFactory: () => new TestServer(this._vscode),
      dumpIO: false,
    });
    const testServer = await testServerBackend.start();
    this._instance = testServer;
    return testServer;
  }

  dispose() {
    this.reset();
  }

  reset() {
    if (this._instancePromise)
      this._instancePromise.then(server => server?.closeGracefully());
    this._instancePromise = undefined;
    this._instance = null;
  }
}

interface TestServerInterface {
  list(params: {
    configFile: string;
    locations: string[];
    reporter: string;
    env: NodeJS.ProcessEnv;
  }): Promise<void>;

  test(params: {
    configFile: string;
    locations: string[];
    reporter: string;
    env: NodeJS.ProcessEnv;
    headed?: boolean;
    oneWorker?: boolean;
    trace?: 'on' | 'off';
    projects?: string[];
    grep?: string;
    reuseContext?: boolean;
    connectWsEndpoint?: string;
  }): Promise<void>;

  findRelatedTestFiles(params: {
    configFile: string;
    files: string[];
  }): Promise<{ testFiles: string[]; errors?: TestError[]; }>;

  stop(params: {
    configFile: string;
  }): Promise<void>;

  closeGracefully(): Promise<void>;
}

interface TestServerEvents {
  on(event: 'stdio', listener: (params: { type: 'stdout' | 'stderr', text?: string, buffer?: string }) => void): void;
}

class TestServer extends BackendClient implements TestServerInterface, TestServerEvents {
  override async initialize(): Promise<void> {
  }

  async list(params: any) {
    await this.send('list', params);
  }

  findRelatedTestFiles(params: { files: string[]; }): Promise<ConfigFindRelatedTestFilesReport> {
    return this.send('findRelatedTestFiles', params);
  }

  async test(params: any) {
    await this.send('test', params);
  }

  async stop() {
    await this.send('stop', {});
  }

  async closeGracefully() {
    await this.send('closeGracefully', {});
    this.close();
  }
}