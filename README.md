# Backend for 3welle.com


## Overview
3welle.com is a web application designed to help Berlin residents and visitors discover the best specialty coffee shops in the city. Users can explore a map of coffee shops, read reviews, and find essential information about each location.

## Technologies Used

- **Express**
- **Apollo Server**
- **GraphQL**
- **MongoDB**
- **JSON Web Token (JWT)**

## Features
- **Map Integration**: View coffee shops on an interactive map.
- **Interactive page**: Detailed page with reviews and ratings for each coffee shop.
- **User Reviews**: Read and submit reviews for each coffee shop.
- **Rating System**: Rate your favorite coffee shops.
- **Responsive Design**: Optimized for both desktop and mobile devices.



## Guest reviews rollout

Unauthenticated visitors can leave reviews. A guest passes reCAPTCHA v3 once to
be issued an identity (`guestId` + secret, kept in the browser's localStorage),
and every later guest action is authenticated with that secret instead. Volume
is capped by the per-IP limits in `src/utils/rateLimit.ts`.

### Required environment variable

    RECAPTCHA_V3_SECRET=...   # v3 secret key — the old v2 keys will not work

The server refuses to boot without it: captcha verification fails closed, so
starting without a secret would only reject every submission at runtime.

### Deploy order

1. Run the index migration, **before** deploying the new code:

       node dist/scripts/migrateGuestIndexes.js

   It replaces the plain unique index on `interactions` with partial ones and
   creates the unique index on `guestidentities`. It is idempotent, and
   `autoIndex` is now off in production, so indexes are only ever created here.

   Already applied to the production database on 2026-08-23; re-running it is
   harmless. Note `src/scripts` is gitignored, so this one file is tracked with
   `git add -f` — without it in the repo the build would not produce
   `dist/scripts/migrateGuestIndexes.js` on the server.

2. Deploy this backend (`captchaToken` is still nullable in the schema, so the
   currently deployed frontend keeps validating; the resolvers reject requests
   without a token).
3. Deploy the frontend.
4. Make `captchaToken` non-null in `root.graphql`, drop the deprecated
   `reviewImages` argument of `addTextReview`, and delete the `/imagekit/auth`
   endpoint in `index.ts` — all three exist only for the previous frontend
   build.

### Frontend:
[![coffeemapberlin](https://github-readme-stats.vercel.app/api/pin/?username=mikhailyatsenko&repo=coffeemapberlin&theme=transparent&show_icons=true)](https://github.com/mikhailyatsenko/coffeemapberlin)


