import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import { Button } from 'primereact/components/button/Button';
import { Panel } from 'primereact/components/panel/Panel';
import { InputText } from 'primereact/components/inputtext/InputText';

import { SynchronizeDir } from '../actions/synchronize';
import { setSynchronizeDir } from '../actions/settings';

const LocalDirActionsBar = ({ disabled, toLocalDir,
  setSynchronizeDir, SynchronizeDir
}) => (
  <Panel>
    <form onSubmit={e => {
        e.preventDefault();
        // start downloading selected items
        SynchronizeDir(toLocalDir);
      }}
    >
      <fieldset>
        <div className="layout-container-horizontal">
          <div className="fixed-element"
            title="Specify To Dir."
          >
            <label>To Dir:</label>
            <InputText value={toLocalDir} size="28"
              onChange={e => setSynchronizeDir(e.target.value)}
            />
          </div>
          <div className="auto-size-element" align="right">
            <Button disabled={disabled} type="submit"
              label="Synchronize" icon="fa-download" title="synchronize to local dir"
            />
          </div>
        </div>
      </fieldset>
    </form>
  </Panel>
);

LocalDirActionsBar.propTypes = {
  disabled: PropTypes.bool.isRequired,
  //toLocalDir: PropTypes.string.isRequired,
  setSynchronizeDir: PropTypes.func.isRequired,
  SynchronizeDir: PropTypes.func.isRequired
};

const mapStateToProps = (state) => ({
  disabled: state.ftp.isConnected===false,
  toLocalDir: state.settings.toLocalDir
});

const mapDispatchToProps = {
  setSynchronizeDir,
  SynchronizeDir
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(LocalDirActionsBar);
