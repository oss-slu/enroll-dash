# [enroll-dash](https://github.com/oss-slu/enroll-dash.git) | [Open Source with SLU](https://oss-slu.github.io)
**Online tools and dashboards for Saint Louis University's Office of Enrollment**

## <u>Tech stack:</u>
- ### <u>Frontend</u>
    ### */app*   
    - Typescript 
    - React
    - Vite 

- ### <u>Backend</u>
    ### */api*
    - Typescript
    - NodeJS
    - Express

## Project installation/setup
### 1. Download and install [Docker Desktop](https://www.docker.com/get-started/)
### 2. Clone the repository & open project locally
`git clone https://github.com/oss-slu/enroll-dash.git`<br>`cd enroll-dash`
### 3. Run project with Docker compose
The frontend can be served by nginx via the *app* container (production behavior) or with vite's dev server for developers to take advantage of hot reloading.
- #### Use docker frontend:
    - Start frontend and backend containers:<br>`docker compose up --build -d`
    - ***Frontend should now be accessible in your browser at http://localhost:80***

- #### Run frontend via vite development server:
    - First, ensure [Node JS](https://nodejs.org/en) is installed<br>
    - Run backend container:<br>`docker compose up api --build -d`
    - Run vite dev server:<br>`cd app && npm ci && npm run dev`<br>
    - ***Frontend should now be accessible in your browser at http://localhost:5173***