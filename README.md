# Welcome to Remix!

## Public engineering card

Embed the live, server-rendered card anywhere that accepts an image (including a GitHub profile README):

```html
<img src="https://lohitaryan.dev/api/github-card" alt="Lohit Aryan Engineering Monitor" width="900" />
```

Use `?theme=light` for light backgrounds. The endpoint contains portfolio information, a sanitised public monitor summary, and recent commits from the public portfolio repository; it does not expose monitor or account credentials.

- [Remix Docs](https://remix.run/docs)

## Fly Setup

1. [Install `flyctl`](https://fly.io/docs/getting-started/installing-flyctl/)

2. Sign up and log in to Fly

```sh
flyctl auth signup
```

3. Setup Fly. It might ask if you want to deploy, say no since you haven't built the app yet.

```sh
flyctl launch
```

## Development

From your terminal:

```sh
npm run dev
```

This starts your app in development mode, rebuilding assets on file changes.

## Deployment

If you've followed the setup instructions already, all you need to do is run this:

```sh
npm run deploy
```

You can run `flyctl info` to get the url and ip address of your server.

Check out the [fly docs](https://fly.io/docs/getting-started/node/) for more information.
