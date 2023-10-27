import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { SingleWidgetApp } from '@jupyterlite/application';
import {ServiceManager} from '@jupyterlab/services'

export interface INotebookOptions {
  initWheels?: string;
  mimeExtensions?: IRenderMime.IExtensionModule[];
  plugins?: SingleWidgetApp.IPluginModule[];
  serviceManager: ServiceManager;
}
