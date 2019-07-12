import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Form, Control, actions } from 'react-redux-form';

import { InputText } from 'primereact/components/inputtext/InputText';
import { Password } from 'primereact/components/password/Password';
import { Button } from 'primereact/components/button/Button';
import { Panel } from 'primereact/components/panel/Panel';

import { connectFtp } from '../actions/ftp';
import notifications from '../utils/notifications';
import { buildFTPAddress, parseFTPAddress } from '../utils/ftpUrl';

const FtpAddressBar = ({ disabled, canConnect, connectFtp, defaultSite }) => (
  <Panel>
    <Form model="ftpAddressForm"
      onSubmit={data => {
        // build the URL address
        let address;
        if (data.host.indexOf(':') >= 0) {
          // if input whole ftp address, ignore other fields
          address = data.host;
        } else {
          address = buildFTPAddress(data);
        }

        if (!parseFTPAddress(address)) {
          notifications.warn(`Sorry, '${address}' is not a valid FTP address.`);
          return false;
        }

        // connectFtp returns a Promise (to be awaitable), so we need to
        // catch reject case here.
        connectFtp(address).catch(() => {});
      }}
    >
      <fieldset disabled={disabled}>
        <div className="layout-container-horizontal">
          <div className="fixed-element" style={{ paddingTop: '0.33em' }}>
            <label>Host:</label>
          </div>
          <div className="auto-size-element">
            <Control model="ftpAddressForm.host"
              component={InputText} className="full-width"
              placeholder="host name or full FTP URL"
            />
          </div>
          <div className="fixed-element">
            <label>Username:</label>
            <Control model="ftpAddressForm.user" size="18" component={InputText} />
          </div>
          <div className="fixed-element">
            <label>Password:</label>
            <Control model="ftpAddressForm.password" size="18"
              component={Password} feedback={false}
            />
          </div>
          <div className="fixed-element">
            <label>Port:</label>
            <Control model="ftpAddressForm.port"
              component={InputText} type="number" min="1" max="65535"
              style={{ width: '4em' }}
            />
          </div>
          <div className="fixed-element">
            <Button type="submit" label="Connect" icon="fa-bolt"
              disabled={!canConnect}
            />
          </div>
          <div className="fixed-element">
            <Button label="default site"
              onClick={e => {
                e.preventDefault();
                defaultSite();
              }}
            />
          </div>
        </div>
      </fieldset>
    </Form>
  </Panel>
);

FtpAddressBar.propTypes = {
  disabled: PropTypes.bool.isRequired,
  canConnect: PropTypes.bool.isRequired,
  connectFtp: PropTypes.func.isRequired
};

const mapStateToProps = (state) => ({
  disabled: state.ftp.isFetching,
  canConnect: state.ftpAddressForm.host.length > 0
});

const defaultSite = aa => (dispatch, getState) => {
  const data11 = {
    host: '127.0.0.1',
    user: 'LTAIwZxpYzrE87X5%2Fsyslog111',
    password: '0V7y63bKWD0cp9NU9XTfO7QL8c5ZYU',
    port: 21,
  };
  dispatch(actions.change('ftpAddressForm', data11));
};

const mapDispatchToProps = {
  connectFtp,
  defaultSite,
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(FtpAddressBar);
