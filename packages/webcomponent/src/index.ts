// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import type { INotebookOptions } from './options';
import defaultsDeep from 'lodash/defaultsDeep';
import 'console';

declare let __webpack_public_path__: string;
console.log('WPP:', __webpack_public_path__);
//const pypiLink = new URL('./pypi/all.json', __webpack_public_path__).toString();
//const baseURL = new URL('../', __webpack_public_path__).toString();
const baseURL = '/';

const jupyterConfigDomId = 'jupyter-config-data';
const elementName = 'jupyter-notebook';

const baseConfig = {
  appName: 'Notebook',
  appVersion: '0.1.0-beta.9',
  baseUrl: baseURL,
  appUrl: './',
  federated_extensions: [],
  fullLabextensionsUrl: './extensions',
  fullMathjaxUrl: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/MathJax.js',
  fullStaticUrl: './',
  licensesUrl: './lab/api/licenses',
  mathjaxConfig: 'TeX-AMS_CHTML-full,Safe',
  mathjaxUrl: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js',
  /*  litePluginSettings: {
    '@jupyterlite/pyolite-kernel-extension:kernel': {
      pyodideUrl: 'https://cdn.jsdelivr.net/pyodide/v0.20.0/full/pyodide.mjs',
//      pipliteUrls: [pypiLink.toString()]
    }
  }*/
};

function overrideConfig(config: any): void {
  defaultsDeep(config, baseConfig);

  let configScriptEl = document.getElementById(
    jupyterConfigDomId,
  ) as HTMLOrSVGScriptElement;
  if (!configScriptEl) {
    configScriptEl = document.createElement('script') as HTMLOrSVGScriptElement;
    configScriptEl.setAttribute('id', jupyterConfigDomId);
    configScriptEl.setAttribute('type', 'application/json');
    configScriptEl.setAttribute('data-jupyter-lite-root', '.');
    document.head.appendChild(configScriptEl);
  }
  configScriptEl.textContent = JSON.stringify(config);
}

export class JupyterNotebookComponent extends HTMLElement {
  // NOTE: currently no need to to override constructor()

  // constructor() should NOT access or set any element properties; use connectedCallback instead.
  // See: https://html.spec.whatwg.org/multipage/custom-elements.html#custom-element-conformance
  connectedCallback() {
    const source = this.getAttribute('src');
    if (!source) {
      return;
    }

    const pyodideUrl = this.getAttribute('pyodideurl');
    const workerUrl = this.getAttribute('serviceworkerurl');
    const options: INotebookOptions = {
      initWheels: this.getAttribute('initwheels') ?? undefined,
    };

    this.style.height = 'fit-content';
    this.style.width = '100%';
    this.style.display = 'block';

    const litePluginSettings: any = {};

    if (pyodideUrl) {
      litePluginSettings['@jupyterlite/pyolite-kernel-extension:kernel'] = {
        pyodideUrl,
      };
    }

    if (workerUrl) {
      if (workerUrl == 'disabled') {
        litePluginSettings['@jupyterlite/server-extension:service-worker'] = {
          disabled: true,
        };
      } else {
        litePluginSettings['@jupyterlite/server-extension:service-worker'] = {
          workerUrl,
        };
      }
    }

    // need to override config before we import index.js, as config gets loaded
    // during import of modules
    overrideConfig({ litePluginSettings });

    import('./component').then((mod) => {
      source && mod.init(source, this, options);
    });
  }
}

export function registerComponent() {
  if (!customElements.get(elementName)) {
    console.log('Registering');
    customElements.define(elementName, JupyterNotebookComponent);
  }
}
