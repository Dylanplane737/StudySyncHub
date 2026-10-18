# StudySync Hub

A simple, local-first study dashboard for keeping schoolwork in one place. It uses plain HTML, CSS, and JavaScript, so the study tools do not need a frontend framework or external API.

## Features

- **Overview dashboard** with task progress, today's focus minutes, flashcard count, and quick actions.
- **Task manager** with subjects, due dates, priorities, details, and open/completed filters.
- **Flashcards** with question/answer review, mastery tracking, and quick practice actions.
- **Study notes** that can be created, edited, deleted, and searched.
- **Focus timer** with configurable work and break lengths. A running timer survives page refreshes, and completed sessions are logged.
- **Light and dark themes** with a responsive layout for desktop and mobile screens.
- **Import/export backups** so your tasks, notes, cards, and focus history can be moved between browsers.
- **Local-only storage**: the study data is saved in the browser and is not sent to an account or cloud service.

## Run locally

Requires Node.js 18 or newer.

Run `npm install` and then `npm start`.

Open http://localhost:3000.

## Data and backups

StudySync Hub stores app data in browser localStorage. It is specific to that browser and device, so export a JSON backup before clearing browser data or moving to another device. Importing a backup replaces the data currently stored by the app.

## Existing proxy endpoint

The previous Nova Proxy page remains available at http://localhost:3000/proxy, and the existing Bare server routing is still handled by the Node server. The main homepage (/) is now StudySync Hub.
