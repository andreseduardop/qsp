# Quick Smart Plan

**Quick Smart Plan** is an AI-powered web application designed to help you plan, organize, and manage projects, events, or any type of activity quickly and clearly.

It also serves as a **live demonstration of how in-browser, local AI** can dynamically generate pages that adapt to a user’s goals in real time. Here, AI goes beyond being a text generator — it becomes a **user interface generator**, capable of creating interactive layouts, components, and workflows on demand.

Whether you’re organizing a personal event, coordinating a professional project, or exploring new ideas, Quick Smart Plan offers an adaptive, intelligent workspace that responds to your intent and helps you stay focused, creative, and efficient.


## Live Demo

See the live demo of the application here:  
👉 **[quick-smart-plan.netlify.app](https://quick-smart-plan.netlify.app/)**


## How to Use the Demo

1. Visit **[quick-smart-plan.netlify.app](https://quick-smart-plan.netlify.app/)**.*
2. Follow the on-screen instructions, or click **“New Plan.”**
3. Wait a little while for the interface to generated automatically. 
4. Voilà! — an interface tailored to your objectives is ready, created in real time with the help of **built-in AI APIs**.

* Before opening the live demo, make sure your device meets the software and hardware requirements for Chrome’s built-in AI APIs, visit [developer.chrome.com/docs/ai/prompt-api](https://developer.chrome.com/docs/ai/prompt-api#hardware-requirements).


## Key Features

* **AI-Powered Layout Composition:**  
  Uses the browser’s **built-in AI APIs** to interpret user objectives and translate them into structured **JSON** through JavaScript, composing a page layout aligned with user intent.

* **Dynamic Interface Generation:**  
  Achieved through modular **VanillaJS** components that render adaptable sections such as task lists, step lists, and timelines.


## Documentation

Full project documentation is available here:
🔗 [https://deepwiki.com/andreseduardop/qsp](https://deepwiki.com/andreseduardop/qsp)


## Local Installation and Build

Follow these steps to work with the project locally:

### Prerequisites

* **Node.js** (v22 or compatible) and **npm**. The Netlify build uses Node.js 22.12.0.
* **Hugo Extended** (v0.150.1 or newer).
* **Dart Sass** available in your `PATH` (for compiling the SCSS pipeline). You can install it by downloading the binary from [the Dart Sass releases](https://github.com/sass/dart-sass/releases) or by using `npm install --global sass`.

### Installation

1. Clone the repository and move into the project directory:

   ```bash
   git clone https://github.com/andreseduardop/qsp.git
   cd qsp
   ```

2. Install the JavaScript dependencies required for the PostCSS pipeline:

   ```bash
   npm install
   ```

### Local Development

Run the Hugo development server to work on the site locally. Hugo will automatically invoke PostCSS and Sass using the dependencies you installed in the previous step.

```bash
hugo server -D
```

The site will be available at the URL printed by Hugo (typically `http://localhost:1313`).

### Production Build

To generate the optimized static site in the `public/` directory, run:

```bash
hugo --gc --minify
```

This command garbage-collects unused resources and minifies the output.


## License

This project is released under the [**MIT License**](https://github.com/andreseduardop/qsp/blob/main/LICENSE).


### Acknowledgments

This product includes the **jsonrepair** library — used for correcting JSON — developed by Jos de Jong and other contributors.
Jsonrepair is distributed under the ISC license.
You can find the full license text [here](https://github.com/josdejong/jsonrepair/blob/main/LICENSE.md).
Repository: [https://github.com/josdejong/jsonrepair](https://github.com/josdejong/jsonrepair)

