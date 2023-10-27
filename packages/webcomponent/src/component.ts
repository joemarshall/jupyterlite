// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import type { INotebookOptions } from './options';

import {ServiceManager} from '@jupyterlab/services'
import { IYText } from '@jupyter/ydoc';
import { Contents, KernelMessage } from '@jupyterlab/services';
import { Dialog } from '@jupyterlab/apputils';

import { nullTranslator } from '@jupyterlab/translation';
import { SingleWidgetApp,SingleWidgetShell } from '@jupyterlite/application';

import { INotebookTracker,NotebookTracker,NotebookWidgetFactory, NotebookModelFactory} from '@jupyterlab/notebook';
import {  standardRendererFactories, RenderMimeRegistry} from '@jupyterlab/rendermime';
import { createMarkdownParser } from '@jupyterlab/markedparser-extension';
import { MathJaxTypesetter } from '@jupyterlab/mathjax-extension';

import { CommandRegistry } from '@lumino/commands';

import { Widget } from '@lumino/widgets';
import { ISignal, Signal } from '@lumino/signaling';
import { ReactiveToolbar } from '@jupyterlab/ui-components';

import {
  NotebookPanel,
  ExecutionIndicator,
} from '@jupyterlab/notebook';

import { CompletionHandler,KernelCompleterProvider,ProviderReconciliator,Completer, CompleterModel } from '@jupyterlab/completer';

import {
  CodeMirrorEditorFactory,
  CodeMirrorMimeTypeService,
  EditorExtensionRegistry,
  EditorLanguageRegistry,
  EditorThemeRegistry,
  ybinding
} from '@jupyterlab/codemirror';

import {
  
} from '@jupyterlab/codeeditor'

import { DocumentManager, IDocumentWidgetOpener } from '@jupyterlab/docmanager';

import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';

import { SetupCommands } from './commands';

import { PathExt } from '@jupyterlab/coreutils';

import '@jupyterlab/application/style/index.css';
import '@jupyterlab/codemirror/style/index.css';
import '@jupyterlab/completer/style/index.css';
import '@jupyterlab/documentsearch/style/index.css';
import '@jupyterlab/notebook/style/index.css';
import '../style/index.css';

// autosaver class to save document if changed
class AutoSaver {
  notebook: any;
  lastContent: string;
  path: string;
  serviceManager: any;
  inSave: boolean;
  lastSave: Date;
  saveTimeout?: ReturnType<typeof setTimeout>;

  constructor(serviceManager: any, notebook: any, path: string) {
    this.lastSave = new Date();
    this.inSave = false;
    this.serviceManager = serviceManager;
    this.path = path;
    this.notebook = notebook;
    this.lastContent = notebook.model.toString();
    notebook.content.modelContentChanged.connect(this._on_change, this);
    this.saveTimeout = undefined;
  }

  release() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
    }
    this.notebook.content.modelContentChanged.disconnect(this);
  }

  _autosave() {
    const contentNow: string = this.notebook.model.toString();
    if (contentNow !== this.lastContent) {
      this.notebook.context.save().then(() => {
        console.log('Autosave done');
        this.lastContent = contentNow;
      });
    }
  }

  _on_change(notebook: any) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this._autosave();
    }, 2000);
  }
}

let _autoSaver: AutoSaver;

function makeEditor()
{
  const editorExtensions = () => {
    const themes = new EditorThemeRegistry();
    EditorThemeRegistry.getDefaultThemes().forEach(theme => {
      themes.addTheme(theme);
    });
    const registry = new EditorExtensionRegistry();

    EditorExtensionRegistry.getDefaultExtensions({ themes }).forEach(
      extensionFactory => {
        registry.addExtension(extensionFactory);
      }
    );
    registry.addExtension({
      name: 'shared-model-binding',
      factory: options => {
        const sharedModel = options.model.sharedModel as IYText;
        return EditorExtensionRegistry.createImmutableExtension(
          ybinding({
            ytext: sharedModel.ysource,
            undoManager: sharedModel.undoManager ?? undefined
          })
        );
      }
    });
    return registry;
  };

  const languages = new EditorLanguageRegistry();
  const mimeTypeService = new CodeMirrorMimeTypeService(languages);
  const editorFactoryService=new CodeMirrorEditorFactory({languages,extensions:editorExtensions()})
  const editorFactory = editorFactoryService.newInlineEditor;
  const rendermime = new RenderMimeRegistry({
    initialFactories:standardRendererFactories,
    latexTypesetter: new MathJaxTypesetter(),
    markdownParser: createMarkdownParser(languages)});

  return {editorFactory,mimeTypeService,rendermime};
}

export async function init(
  notebookSource: string,
  parentElement: HTMLElement,
  options: INotebookOptions,  
): Promise<void> {

  const initWheelList = options.initWheels?.split('\n') || [];

  // retrieve the custom service manager from the server app
  const serviceManager:ServiceManager=options.serviceManager;
  await serviceManager.ready;
  await serviceManager.kernelspecs.ready;
  await serviceManager.kernelspecs.refreshSpecs();
  console.log('kernels ready', serviceManager.kernelspecs.specs);

  // Initialize the command registry with the bindings.
  const commands = new CommandRegistry();
  const useCapture = true;


  // create a frontend object to hold mime plugins etc.
  let frontend=new SingleWidgetApp({shell: new SingleWidgetShell(),mimeExtensions:options.mimeExtensions,serviceManager});
  if(options.plugins){
    frontend.registerPluginModules(options.plugins);
  }
  while(!parentElement.id){
    // generate a hopefully unique id (and assign it if it doesn't exist)
    var newID=`jl_webcomponent_${Math.random()}`;
    if(!document.getElementById('newID')){
      parentElement.id=newID;
    }
  }
  await frontend.start({hostID:parentElement.id});
  const docRegistry = frontend.docRegistry;

  // Setup the keydown listener for the document.
  document.addEventListener(
    'keydown',
    (event) => {
      commands.processKeydownEvent(event);
    },
    useCapture,
  );
  
  class Opener implements IDocumentWidgetOpener {
    private _opened = new Signal<
      Opener,
      IDocumentWidget<Widget, DocumentRegistry.IModel>
    >(this);

    public get opened(): ISignal<
      Opener,
      IDocumentWidget<Widget, DocumentRegistry.IModel>
    > {
      return this._opened;
    }

    open(widget: Widget, options?: DocumentRegistry.IOpenOptions) {
      // Do nothing for sibling widgets for now.
    }
  }

  const docManager = new DocumentManager({
    registry: docRegistry,
    manager: serviceManager,
    opener: new Opener(),
  });
  const {editorFactory,mimeTypeService,rendermime}=makeEditor();
  const nbModelFactory = new NotebookModelFactory({});
  const nbContentFactory = new NotebookPanel.ContentFactory({ editorFactory });  
  const nbWidgetFactory = new NotebookWidgetFactory({
    name: 'Notebook',
    modelName: 'notebook',
    fileTypes: ['notebook'],
    defaultFor: ['notebook'],
    preferKernel: true,
    canStartKernel: true,
    rendermime,
    contentFactory:nbContentFactory,
    mimeTypeService
//    toolbarFactory
  });
  nbWidgetFactory.notebookConfig.windowingMode="none";
  docRegistry.addModelFactory(nbModelFactory);
  docRegistry.addWidgetFactory(nbWidgetFactory);

  const notebookURL: URL = new URL(notebookSource, document.location.href);
  const notebookResponse = await fetch(notebookURL.toString());
  const notebookText = await notebookResponse.text();
  const notebookPath = PathExt.basename(notebookURL.pathname);
  //const contentType=mFactory.contentType;
  //const contentFormat=mFactory.fileFormat;
  const fileContents: Partial<Contents.IModel> = {
    name: notebookPath,
    path: notebookPath,
    type: 'file',
    content: notebookText,
    mimetype: 'text/plain',
    format: 'text',
  };

  // first check two things
  // 1) Does the base file need rewriting
  // 2) Do we have an autosaved version of the file which is different from the (previous) base file
  let updatedBaseFile: boolean = false;
  let autosaveExists: boolean = false;

  try {
    const current = await serviceManager.contents.get(notebookPath, {
      content: true,
      format: 'text',
      type: 'file',
    });
    if (current.content != notebookText) {
      updatedBaseFile = true;
    }
  } catch {
    // no file - so this is an update
    updatedBaseFile = true;
  }

  const autosavePath = 'autosaved.' + notebookPath;
  // check if there is an autosave and if it is different to the current base file
  try {
    await serviceManager.contents.get(autosavePath, { content: false });
    console.debug('autosave exists');
    autosaveExists = true;
  } catch {
    // no autosave file, so don't worry about overwriting and just write a new one
    console.debug('Making new autosave file');
    autosaveExists = false;
    await serviceManager.contents.save(autosavePath, fileContents);
  }

  if (updatedBaseFile) {
    // new version of base file -  need to write it
    //      //@ts-ignore
    const savedFile = await serviceManager.contents.save(notebookPath, fileContents);
    console.debug('Updated base file:', savedFile);
    if (autosaveExists) {
      console.debug('Autosave exists - need to check whether to reload base');
      const dialog = new Dialog({
        title:
          'This notebook has been updated on the website, load it and overwrite any changes you may have made?',
        buttons: [
          Dialog.cancelButton({ label: 'Keep my changes' }),
          Dialog.okButton({ label: 'Reset my changes' }),
        ],
        host: parentElement,
      });
      const response = await dialog.launch();
      if (response.button.accept === true) {
        await serviceManager.contents.save('autosaved.' + notebookPath, fileContents);
        console.log('Reset autosave file');
      }
    }
  } else {
    console.debug('Base file unchanged');
  }

  const nbWidget = docManager.open(autosavePath) as NotebookPanel;
  nbWidget.content.notebookConfig.windowingMode='none';
  frontend.shell.add(nbWidget);
  var nbTracker= await frontend.resolveOptionalService(INotebookTracker);
  if(nbTracker && nbTracker instanceof NotebookTracker){
    var tracker=nbTracker as NotebookTracker;
    tracker.add(nbWidget);
  }

  _autoSaver = new AutoSaver(serviceManager, nbWidget, 'autosaved.' + notebookPath);
  const sessionContext = nbWidget.context.sessionContext;



  // setup toolbar, keyboard shortcuts etc.
  SetupCommands(
    commands,
    nbWidget.toolbar,
    nbWidget,
    serviceManager,
    fileContents,
    autosavePath,
  );

  // add execution indicator at end of the toolbar
  nbWidget.toolbar.addItem('spacer', ReactiveToolbar.createSpacerItem());
  const indicator = ExecutionIndicator.createExecutionIndicatorItem(
    nbWidget,
    nullTranslator,
    undefined,
  );
  nbWidget.toolbar.addItem('Kernel status:', indicator);
  indicator.update();

  const editor =
  nbWidget.content.activeCell && nbWidget.content.activeCell.editor;

  const model = new CompleterModel();
  const completer = new Completer({ editor, model });
  const timeout = 1000;
  const provider = new KernelCompleterProvider();
  const reconciliator = new ProviderReconciliator({
    context: { widget: nbWidget, editor, session: sessionContext.session },
    providers: [provider],
    timeout: timeout
  });
  const handler = new CompletionHandler({ completer, reconciliator });

  void sessionContext.ready.then(() => {
    const provider = new KernelCompleterProvider();
    const reconciliator = new ProviderReconciliator({
      context: { widget: nbWidget, editor, session: sessionContext.session },
      providers: [provider],
      timeout: timeout
    });

    handler.reconciliator = reconciliator;
  });  

  handler.editor=editor;

  nbWidget.content.activeCellChanged.connect((sender, cell) => {
    handler.editor = cell && cell.editor;
  });

  // Handle resize events.
/*  window.addEventListener('resize', () => {
    panel.update();
  });*/

  // remove css rules that apply to body element
  // because we don't want to mess up anything outside our widget
  window.setTimeout(() => {
    for(let sheet of document.styleSheets){
      var rulesToDelete=[]
      for(let i=0;i<sheet.cssRules.length;i++){
        const rule=sheet.cssRules[i];
        if(rule instanceof CSSStyleRule && rule.selectorText){
          if(rule.selectorText === "body"){
            rulesToDelete.push(i);
          }
        }
      }
      for(const r of rulesToDelete){
        sheet.deleteRule(r);
      }
    }
    const all_divs = parentElement.getElementsByTagName('div');
    for (const d of all_divs) {
      if (
//        d.id === 'notebook_main' ||
//        d.classList.contains('jp-Cell') ||
        d.classList.contains('jp-Notebook') ||
//        d.classList.contains('jp-NotebookPanel') ||
        d.classList.contains('jp-Toolbar') ||
        d.classList.contains('lm-Panel')
      ) {
        d.style.position = 'relative';
        d.style.height = 'fit-content';
        d.style.top = '0px';
        if(d.style.contain==="strict")
        {
          d.style.contain="style paint";
        }
      }
    }
  }, 0);

  // load all the init wheels into kernel
  let loadWheelsCode;

  loadWheelsCode = `
import pyodide_js as _pjs
import pyodide as _p
_package_list=[`;

  loadWheelsCode += initWheelList
    .map((x) => {
      const url = new URL(x, document.location.toString());
      return `'${url}'`;
    })
    .join(',');
  loadWheelsCode += `]
_package_list=[x for x in _package_list if x not in set((_pjs.loadedPackages.to_py()).keys())]
print(_package_list)
await _pjs.loadPackage(_package_list)
del _package_list
del _pjs
del _p
`;

  const content: KernelMessage.IExecuteRequestMsg['content'] = {
    code: loadWheelsCode,
    stop_on_error: true,
  };
  await sessionContext.ready;
  const kernel = sessionContext.session?.kernel;
  if (!kernel) {
    throw new Error('Session has no kernel.');
  }
  if (kernel.status != 'idle') {
    const slot = async () => {
      console.log(kernel.status);
      if (kernel.status === 'idle') {
        console.log('Loading wheels');
        kernel.statusChanged.disconnect(slot);
        await kernel.requestExecute(content, false, undefined);
        console.log('Loaded wheels');
      }
    };
    kernel.statusChanged.connect(slot);
  } else {
    kernel.requestExecute(content, false, undefined);
  }
  console.debug('Notebook started!');
}

window.addEventListener('beforeunload', () => {
  if (_autoSaver) {
    _autoSaver.release();
  }
});
