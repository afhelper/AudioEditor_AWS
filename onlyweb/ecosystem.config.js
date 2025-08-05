module.exports = {
  apps : [{
    name: "audio-converter",
    script: "/home/ubuntu/.pyenv/versions/3.12.3/bin/uvicorn",

    args: "main:app --host 0.0.0.0 --port 8001",

    // 스크립트가 실행될 디렉터리를 명확히 지정해주는 게 좋아.
    // main.py 파일이 있는 경로로 설정해줘.
    cwd: "/home/ubuntu/bot/audio-converter",

    interpreter: "none",
    exec_mode: "fork",
    watch: false,
    env: {
      "NODE_ENV": "production",
      // 여기에 필요한 다른 환경변수들을 추가할 수 있어.
    }
  }]
};