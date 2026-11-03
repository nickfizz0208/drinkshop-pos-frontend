import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Angular Standalone 啟動入口：以 AppComponent 為根元件，套用 appConfig 的全站設定。
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
