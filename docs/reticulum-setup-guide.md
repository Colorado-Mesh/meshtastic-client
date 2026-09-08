# Your first Reticulum connection

Open **Reticulum → Connection → Open setup guide**. You can get started with your computer and an internet connection; a radio is optional.

1. **Start here:** start Reticulum inside mesh-client. Opening the guide itself does not change your settings.
2. **Your identity:** choose a name or callsign. The guide keeps an existing identity. For a new identity, save the recovery words before continuing. These words are private; your messaging address is what you share with friends. Already have an identity? Open the restore controls in Network instead of generating a replacement.
3. **Get connected:** select one public internet hub, configure your RNode through the existing connection controls, or check your existing setup. Internet setup adds or enables only the selected hub and restarts Reticulum. It leaves your other connections intact. A failed restart does not remove the saved connection; retrying reuses it.
4. **Try it out:** copy your LXMF messaging address, find a friend in Peers, or open RRC for group chat. The guide explains the main tabs and the difference between delivery and storage at an intermediary.

## What the connection check means

The guide checks live networking, messaging readiness, and the chosen interface. A listening local service alone is insufficient. Internet setup requires the selected hub to be online; an unrelated local-network connection cannot satisfy that check. Radio setup requires an enabled, online local radio interface. Existing setup accepts any enabled, online interface, including a local-network connection.

These checks confirm local readiness. They do not prove a particular person is reachable or that another radio is in range. Peers appear as their announcements reach you. Ask a friend for their LXMF address and use the lookup field in Peers if you already know whom you want to contact.

If a hub stays unavailable, check your internet connection or try a different hub. The previous hub remains in your connection settings; disable unused connections there. Public hubs can see your IP address. Start with one rather than enabling many at once.

For radio setup, use RNode-compatible hardware and the settings provided by your local group. The guide does not guess frequencies, change firmware, or alter radio settings. Follow the existing connection form, enable the interface, apply its restart prompt, and return to the guide.

## Where things live

| Tab        | Start here for                                                                 |
| ---------- | ------------------------------------------------------------------------------ |
| Connection | Starting Reticulum and managing internet, local-network, or radio connections  |
| Network    | Your identity, backups, and optional propagation settings for offline messages |
| Peers      | Finding people and services, looking up addresses, and saving contacts         |
| Chat       | Direct messages                                                                |
| RRC        | Group conversations through a chat hub                                         |
| Nomad      | Browsing pages published on the network                                        |

You can explore Remote, Admin, and the other tools later. If a guide destination is hidden, enable that tab in App settings.

For background on interfaces and internet connections, see the official [Reticulum getting-started guide](https://reticulum.network/manual/gettingstartedfast.html). For advanced mesh-client settings, see [Reticulum in mesh-client](reticulum.md).

## Maintenance

`ReticulumSetupGuide` uses the existing stack lifecycle and tab navigation callbacks. Identity and interface operations live in `reticulumSetup.ts` and use the existing IPC proxy. Public endpoints come from the shared hub catalog. Re-read configuration before mutation, never replace an identity, preserve private interface settings, and distinguish live readiness from process startup. The guide polls status only while open on the connection or exploration steps; stale completions after closing or stopping must not re-enable readiness.
