<div align="center">
    <h1>RS-SDK</h1>
</div>

[![Discord](https://img.shields.io/discord/1234567890?color=5865F2&logo=discord&logoColor=white)](https://discord.gg/3DcuU5cMJN)
[![Hiscores](https://img.shields.io/badge/Hiscores-View%20Leaderboard-gold)](https://rs-sdk.com/hiscores)

rs-sdk is a typescript library for driving research-oriented bots inside a recognizable and complex economic role-playing mmo environment.

The goal is to help people develop botting scripts to learn automation techniques, experiment with AI agents, and explore agent-agent collaboration and economics in a controlled setting.

## Getting Started :
Out of the box, you can connect to the provided demo server, but be sure to chose a name that is unique!
rs-sdk was developed with special consideration towards use via agent loops, but it can be used as stand-alone typescript files

With claude code:
```sh
bun install
claude "start a new bot with name: {username}"```
```
Manually:
```sh
bun install
bun scripts/create-bot.ts {username}
bun bots/{username}/script.ts 
```

Then you can run your bot script:
```sh

> [!NOTE]
> RS-SDK is a fork and extension of the base LostCity engine and client. LostCity is an amazing project without which this would not be possible. 
> Find their original code here or read their history and ethos on their forum: https://lostcity.rs/t/faq-what-is-lost-city/16


## Dependencies

- [Bun 1.2+](https://bun.sh)

---



## Gameplay Modifications

This server has a few modifications from the original game to make development and bot testing easier:

- **Faster leveling** - The XP curve is flattened and accelerated so high-level skills don't take as long to train
- **Infinite run energy** - Players never run out of energy 
- **No random events** - Anti-botting random events are disabled 

---

## Disclaimer

This is a free, open-source, community-run project.

The goal is strictly education and scientific research.

LostCity Server was written from scratch after many hours of research and peer review. Everything you see is completely and transparently open source.

We have not been endorsed by, authorized by, or officially communicated with Jagex Ltd. on our efforts here.

You cannot play Old School RuneScape here, buy RuneScape gold, or access any of the official game's services!

---

## License
This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). See the [LICENSE](LICENSE) file for details.
