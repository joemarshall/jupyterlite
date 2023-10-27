// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEndPlugin,
  JupyterFrontEnd,
} from '@jupyterlab/application';

import {NotebookTracker,INotebookTracker} from "@jupyterlab/notebook"
// we use plugins from repl-extension to provide paths, router etc.
import ReplPlugins from "@jupyterlite/repl-extension";
import EditorPlugins from "@jupyterlab/codemirror-extension";

const trackerPlugin: JupyterFrontEndPlugin<INotebookTracker> = {
  id: '@jupyterlab/notebook-extension:tracker',
  description: 'Provides the notebook widget tracker.',
  provides: INotebookTracker,
  requires: [],
  optional: [
  ],
  activate: activateNotebookTracker,
  autoStart: true
};

function activateNotebookTracker(app: JupyterFrontEnd): INotebookTracker{
  return new NotebookTracker({ namespace: 'notebook' });
} 

var plugins: JupyterFrontEndPlugin<any>[] = ReplPlugins;
plugins.push(trackerPlugin);
plugins=plugins.concat(EditorPlugins)

export default plugins;
