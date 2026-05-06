# Remote xAPI

JavaScript helper library for Cisco RoomOS macros that send xAPI status, configuration, and command requests to remote RoomOS devices over HTTPS using the local `HttpClient` xCommands.

Key features:

- Dot-notation access that feels similar to the local RoomOS `xapi` object.
- HTTP request queueing to prevent the macro runtime from exhausting the limited number of available `HttpClient` request slots.
- Built-in XML-to-JavaScript parsing for RoomOS xAPI responses, which is needed because the Cisco Collaboration macro JavaScript runtime does not include a native XML parsing library.
- RoomOS-style error objects for remote command and `HttpClient` failures.

## Overview

`remote-xapi.js` wraps remote RoomOS xAPI calls behind a simple interface that feels similar to the local `xapi` object used in macros. The library automatically decides whether a request should be sent as a `getxml` or `putxml` call, then sends it to the remote device with the local device's `HttpClient`.

To keep macro execution reliable, requests are placed onto a single queue and processed one at a time. This helps avoid failures caused by opening too many concurrent `HttpClient` requests from the RoomOS macro runtime.

The library also parses XML responses into JavaScript objects and primitive values so macro code can work with JSON-like results instead of raw XML strings.

```javascript
import { RemoteXAPI } from './remote-xapi';

const remoteCodec = new RemoteXAPI({
  address: '10.10.10.10',
  username: 'admin',
  password: 'password',
});

await remoteCodec.Command.Audio.Volume.Set({ Level: 40 });

const volume = await remoteCodec.Status.Audio.Volume.get();
console.log('Remote Device Volume:', volume);

const defaultVolume = await remoteCodec.Config.Audio.DefaultVolume.get();
console.log('Remote Device DefaultVolume:', defaultVolume);

```

## Setup

### Prerequisites

- A Cisco RoomOS device with Macro Editor access.
- Network connectivity from the local RoomOS device to each remote RoomOS device.
- Credentials for each remote RoomOS device API account.
- A copy of `remote-xapi.js` from this repository.

### Installation Steps

1. Open the RoomOS device web interface, then go to `Customization > Macro Editor`.
2. Create a new macro named `remote-xapi`.
3. Paste the contents of [remote-xapi.js](/remote-xapi.js) into that macro and save it.
4. Keep the `remote-xapi` macro set to `Off`; it is intended to be imported by other macros.
5. Create a second macro for your application logic, for example `remote-xapi-demo`.
6. Import the library macro in your application macro:

```js
import { RemoteXAPI } from './remote-xapi';
```

7. Create a remote device definition with the target device address and credentials:

```js
const remoteCodec = new RemoteXAPI({
  address: '10.10.10.50',
  username: 'admin',
  password: 'password',
});
```

8. Save and enable your application macro.

## Security Notes

Creating a `RemoteXAPI` instance automatically enables the local device's `HttpClient` and allows insecure HTTPS:

```js
xapi.Config.HttpClient.Mode.set('On');
xapi.Config.HttpClient.AllowInsecureHTTPS.set('True');
```

Requests use HTTPS and Basic authentication. The username and password are sent in an `Authorization` header, encoded as Base64. Base64 is not encryption, so treat macro source and device backups as sensitive if they contain remote credentials.

Recommended practice:

- Use a dedicated remote device account with only the permissions your macro needs.
- Store credentials carefully and avoid committing real passwords to source control.
- Run this only on trusted networks where the local RoomOS device is expected to reach the remote devices.
- Review whether allowing insecure HTTPS is acceptable for your deployment.

## API Examples

### Read Status

```js
const volume = await remoteCodec.Status.Audio.Volume.get();
console.log(volume);
```

Status requests are sent with `getxml` and return parsed values such as strings, numbers, booleans, arrays, or objects depending on the remote XML response.

### Read Configuration

```js
const defaultVolume = await remoteCodec.Config.Audio.DefaultVolume.get();
console.log(defaultVolume);
```

Configuration reads are sent with `getxml`.

### Write Configuration

```js
const result = await remoteCodec.Config.Audio.DefaultVolume.set(100);
console.log(result);
```

Configuration writes are sent with `putxml` and return the parsed RoomOS response body.

### Run Commands

```js
const result = await remoteCodec.Command.UserInterface.Message.Alert.Display({
  Title: 'Remote xAPI Demo',
  Text: 'Remote codec connected successfully',
  Duration: 5,
});

console.log(result);
```

Command requests are sent with `putxml`. The library builds the expected XML payload and returns the parsed `*Result` object when present.

### IPv6 Addresses

IPv6 addresses can be provided without brackets. The library wraps them correctly for the request URL:

```js
const remoteCodec = new RemoteXAPI({
  address: '2001:db8::10',
  username: 'admin',
  password: 'password',
});
```

### Request Bodies

Commands that accept free-form body content can pass it as the second argument:

```js
await remoteCodec.Command.UserInterface.Extensions.Panel.Save(
  { PanelId: 'example-panel' },
  '<Extensions><Version>1.11</Version><Panel>...</Panel></Extensions>',
);
```

## Error Handling

Wrap remote calls in `try` / `catch`. Most remote command and `HttpClient` failures use the same object style as RoomOS xAPI errors:

```js
try {
  await remoteCodec.Command.Audio.Volume.Set({ Level: 'loud' });
} catch (error) {
  console.error(error.code, error.message, error.data);
}
```

Common cases:

- Unauthorized remote device response: `{ message: 'Unauthorized' }`
- Unknown remote command: `{ code: 3, message: 'Unknown command' }`
- Invalid or missing parameters: `{ code: 4, message: 'Invalid or missing parameters' }`
- Offline or timed out remote device: `{ code: 1, message: 'Command returned an error.', data: { ... } }`

Generic JavaScript failures that are not already xAPI-shaped are returned as `{ message: '[device-address]: original message' }`.

## Demo

The example below shows how to connect to a remote RoomOS device, read a status value, update a configuration value, and send a command.

```js
import xapi from 'xapi';
import { RemoteXAPI } from './remote-xapi';

const remoteCodec = new RemoteXAPI({
  address: '10.10.10.50',
  username: 'admin',
  password: 'password',
});

async function syncRemoteVolume() {
  try {
    const volume = await remoteCodec.Status.Audio.Volume.get();
    console.log(`Remote volume is ${volume}`);

    if (volume < 50) {
      await remoteCodec.Config.Audio.DefaultVolume.set(100);
      console.log('Remote default volume updated to 100');
    }

    await remoteCodec.Command.UserInterface.Message.Alert.Display({
      Title: 'Remote xAPI Demo',
      Text: 'Remote codec connected successfully',
      Duration: 5,
    });
  } catch (error) {
    console.error('Remote xAPI request failed:', error);
  }
}

xapi.Event.SystemUnit.State.NumberOfActiveCalls.on((activeCalls) => {
  if (activeCalls > 0) {
    syncRemoteVolume();
  }
});
```

## Operational Notes

- Requests are processed serially through a shared queue, even when multiple `RemoteXAPI` instances are used.
- Each request currently uses a 2-second `HttpClient` timeout.
- This helper is request/response focused. Remote event subscriptions such as `remoteCodec.Status.Audio.Volume.on(...)` are not implemented.
- XML responses are parsed by a lightweight parser that covers the RoomOS response shapes used by this library. It is not intended to be a general-purpose XML parser.
- `Status` and `Configuration` paths are requested with `/getxml?location=/...`.
- `Command` calls and configuration writes are sent to `/putxml`.

## Local Development

Install dependencies:

```sh
npm install
```

Run the test suite:

```sh
npm test
```

Run tests in watch mode:

```sh
npm run test:watch
```

The Jest setup maps `xapi` to `jest-mock-xapi`, allowing the tests to validate `HttpClient` request options, response parsing, queue behavior, timeouts, and RoomOS-style errors without a physical device.

## License

All contents are licensed under the MIT license. Please see [LICENSE](LICENSE) for details.

## Disclaimer

Everything included is for demo and proof-of-concept purposes only. Use of this project is solely at your own risk. This repository may contain links to third-party content, which we do not warrant, endorse, or assume liability for. These demos are for Cisco Webex use cases, but are not official Cisco Webex branded demos.

## Questions

Please contact the WXSD team at [wxsd@external.cisco.com](mailto:wxsd@external.cisco.com?subject=remote-xapi) for questions. Or, if you're a Cisco internal employee, reach out to us on the Webex App via our bot (`globalexpert@webex.bot`). In the "Engagement Type" field, choose the "API/SDK Proof of Concept Integration Development" option to make sure you reach our team.

*For more demos and PoCs like this, check out our [Webex Labs site](https://collabtoolbox.cisco.com/webex-labs).*
