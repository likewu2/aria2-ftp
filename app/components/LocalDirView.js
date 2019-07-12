import React from 'react';

import LocalDirNavigator from './LocalDirNavigator';
import LocalDirExplorer from './LocalDirExplorer';
import LocalDirActionsBar from './LocalDirActionsBar';

const LocalDirView = () => (
  <div className="layout-container-vertical full-height">
    <div>
      <LocalDirNavigator dirLabel="Local:" model="localDirForm" />
    </div>
    <div className="full-height">
      <LocalDirExplorer />
    </div>
    <div>
      <LocalDirActionsBar />
    </div>
  </div>
);

export default LocalDirView;
