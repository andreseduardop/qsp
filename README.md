# Quick Smart Plan

**Quick Smart Plan** is an AI-powered web application designed to help you plan, organize, and manage projects, events, and any type of activity with speed and clarity.

It’s also a **live demonstration of how local, in-browser AI** can dynamically generate pages that adapt to the user’s specific goals in real time. Here, AI moves beyond being just a text generator — it becomes a **user interface generator**, capable of shaping interactive layouts, components, and workflows on demand.

Whether you’re organizing a personal event, coordinating a professional project, or exploring new ideas, Quick Smart Plan offers an adaptive, intelligent workspace that responds to your intent and helps you stay focused, creative, and efficient.

## Live demo 

You can see a live demo of the application here: **[https://quicksmartplan.netlify.app/](https://quicksmartplan.netlify.app/)**

## How to Use the Demo

1.  Navigate to **[quicksmartplan.netlify.app](https://quicksmartplan.netlify.app/)**.
2.  Follow the on-screen instructions, or click **"New Plan"**.
3.  Wait a few seconds for the interface to be configured.
4.  Voilà! An interface adapted to your objectives, composed with the help of **built-in AI APIs**, is ready.

## Key features

* **AI-Powered Layout Composition:** Uses the browser's **built-in AI APIs** to interpret user objectives, translating them into processable **JSON** via JavaScript to compose a page layout adapted to the user's intent.
* **Dynamic Interface Generation:** Achieved through modular **VanillaJS** components that mount sections such as task lists, step lists, and timelines.

## Documentation

You can find the project documentation here: https://deepwiki.com/andreseduardop/listy

## Prerequisites

Make sure these tools are installed on your development machine:

- [Node.js](https://nodejs.org/) 18 or later (Netlify uses 22.12.0 in its configuration).
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/) to install the project’s Node.js dependencies.
- [Hugo Extended](https://gohugo.io/getting-started/installing/) 0.115 or later, required to process SCSS.
- Optional: [Dart Sass](https://sass-lang.com/dart-sass) if you want to compile styles outside the Hugo workflow.


## Getting started

1. Clone the repository and change into the project directory.
   ```bash
   git clone <repo-url>
   cd listy
   ```
2. Install the project dependencies.
   ```bash
   npm install
   ```
3. Run the Hugo development server (include drafts and future-dated content if needed).
   ```bash
   hugo server -D
   ```
4. Open `http://localhost:1313` in your browser. Changes in `content/`, `layouts/`, `assets/`, and `static/` will be reflected automatically.

## Production build

Generate the optimized version that Netlify publishes with:
```bash
HUGO_ENVIRONMENT=production hugo --gc --minify
```
- `--gc` cleans orphaned resources in `resources/`.
- `--minify` compresses HTML, CSS, and JS.
- The PostCSS pipeline runs automatically thanks to `postcss.config.js`.

The output will be saved to the `public/` directory, ready to upload to a static hosting provider.

## Deploying on Netlify

Netlify uses `netlify.toml` to build the site:

- Downloads and enables Dart Sass, and configures the specified versions of Hugo and Node.
- Runs `hugo --gc --minify --baseURL "$URL"`, ensuring the content is generated with minification and clean resources.
- Publishes the `public/` directory.

There is no need to define additional commands: pushing to the main branch will automatically trigger this workflow in Netlify.

## License

This project is released under the [**MIT** license](https://github.com/andreseduardop/listy/blob/main/LICENSE). 

## Acknowledgments

This product includes the jsonrepair library developed by Jos de Jong and other contributors. Jsonrepair is subject to the ISC license. The full license text can be found [here](https://github.com/josdejong/jsonrepair/blob/main/LICENSE.md).
Repository: https://github.com/josdejong/jsonrepair
