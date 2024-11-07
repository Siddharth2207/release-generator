# Raindex Releases Automation

This repository automates the generation and posting of release reports for the Raindex apps and repository under `rainlanguage` github org.

## Environment Variables
```
# Github access token
API_GITHUB_TOKEN=

# Open AI access token
OPENAI_API_KEY=
```

## Install and Build Dependencies
Install nix shell and run : 
```
nix develop -c build-js-bindings
```

## Raindex releases
```
nix develop -c raindex-release
```

## Rainlangauge releases
```
nix develop -c rainlanguage-release
```