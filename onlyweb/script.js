const { createFFmpeg, fetchFile } = FFmpeg;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInputBtn = document.getElementById('file-input-btn');
const fileInput = document.getElementById('file-input');
const convertBtn = document.getElementById('convert-btn');
const outputFormatSelect = document.getElementById('output-format');
const bitrateSelect = document.getElementById('bitrate');
const statusText = document.getElementById('status-text');
const progressBarContainer = document.querySelector('.progress-bar-container');
const progressBar = document.getElementById('progress-bar');
const downloadLink = document.getElementById('download-link');

let ffmpeg;
let selectedFile = null;

// 1. FFmpeg 로드
async function loadFFmpeg() {
    try {
        ffmpeg = createFFmpeg({
            log: true, // 콘솔에 FFmpeg 로그 출력
            progress: ({ ratio }) => {
                // 변환 진행률 업데이트
                if (ratio >= 0 && ratio <= 1) {
                    progressBar.style.width = `${ratio * 100}%`;
                    progressBar.textContent = `${Math.round(ratio * 100)}%`;
                }
            },
        });
        await ffmpeg.load();
        statusText.textContent = '변환할 파일을 선택하세요.';
    } catch (error) {
        console.error('FFmpeg 로드 실패:', error);
        statusText.textContent = '오류: FFmpeg를 로드할 수 없습니다. 페이지를 새로고침하세요.';
        convertBtn.disabled = true;
    }
}

// 2. 파일 핸들링
function handleFileSelect(file) {
    const supportedExtensions = ['.wav', '.ogg', '.mp3', '.m4a', '.flac', '.webm'];
    const fileName = file ? file.name.toLowerCase() : '';

    if (file && supportedExtensions.some(ext => fileName.endsWith(ext))) {
        selectedFile = file;
        dropZone.firstElementChild.textContent = `선택된 파일: ${file.name}`;
        convertBtn.disabled = false;
        statusText.textContent = '옵션을 확인하고 변환 버튼을 누르세요.';
        downloadLink.style.display = 'none'; // 이전 다운로드 링크 숨기기
    } else {
        selectedFile = null;
        convertBtn.disabled = true;
        statusText.textContent = `오류: 지원하지 않는 파일 형식입니다. (${supportedExtensions.join(', ')})`;
    }
}

// 파일 선택 버튼 클릭
fileInputBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

// 드래그 앤 드롭 이벤트
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFileSelect(e.dataTransfer.files[0]);
});

// 파일명에서 OS 예약 문자를 '_'로 안전하게 치환하는 함수
function sanitizeForFilename(name) {
    // Windows 및 다른 OS에서 금지하는 주요 문자들: \ / : * ? " < > |
    return name.replace(/[\/:\*?"<>\|]/g, '_');
}

// 3. 변환 실행
convertBtn.addEventListener('click', async () => {
    if (!selectedFile || !ffmpeg || !ffmpeg.isLoaded()) {
        statusText.textContent = '오류: FFmpeg가 로드되지 않았거나 파일이 선택되지 않았습니다.';
        return;
    }

    // UI 비활성화 및 상태 초기화
    convertBtn.disabled = true;
    downloadLink.style.display = 'none';
    progressBarContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    statusText.textContent = '변환 준비 중...';

    try {
        // [수정] 파일명 처리 로직
        // 1. 내부에서 사용할 고정된 파일명 정의
        const inputExtension = selectedFile.name.split('.').pop();
        const internalInputName = `input.${inputExtension}`;
        
        const outputFormat = outputFormatSelect.value;
        const internalOutputName = `output.${outputFormat}`;

        // 2. 다운로드 시 사용할 최종 파일명 생성
        const originalBaseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
        // [개선] 정제 함수를 통과시켜 안전한 파일명 확보
        const sanitizedBaseName = sanitizeForFilename(originalBaseName);
        const finalDownloadName = `${sanitizedBaseName}.${outputFormat}`;
        
        const bitrate = bitrateSelect.value;

        // 파일을 FFmpeg의 가상 파일 시스템에 고정된 이름으로 쓰기
        statusText.textContent = '파일을 메모리에 쓰는 중...';
        ffmpeg.FS('writeFile', internalInputName, await fetchFile(selectedFile));

        // FFmpeg 명령어에도 고정된 이름을 사용
        const command = [
            '-i', internalInputName,
            '-c:a', outputFormat === 'm4a' ? 'aac' : 'libmp3lame',
            '-b:a', bitrate,
            '-ar', '44100',
            '-ac', '2',
            internalOutputName
        ];

        // 변환 실행
        statusText.textContent = '변환 중... (파일 크기에 따라 시간이 걸릴 수 있습니다)';
        await ffmpeg.run(...command);

        // 결과 파일을 가상 파일 시스템에서 읽기
        statusText.textContent = '결과를 처리하는 중...';
        const data = ffmpeg.FS('readFile', internalOutputName);

        // 다운로드 링크 생성
        const blob = new Blob([data.buffer], { type: `audio/${outputFormat === 'm4a' ? 'mp4' : 'mpeg'}` });
        const url = URL.createObjectURL(blob);

        downloadLink.href = url;
        // 다운로드 시에는 정제된 최종 파일명을 사용
        downloadLink.download = finalDownloadName;
        downloadLink.textContent = `다운로드: ${finalDownloadName}`;
        downloadLink.style.display = 'block';

        statusText.textContent = '변환 완료!';

        // 가상 파일 시스템 정리
        ffmpeg.FS('unlink', internalInputName);
        ffmpeg.FS('unlink', internalOutputName);

    } catch (error) {
        console.error('변환 오류:', error);
        statusText.textContent = `오류가 발생했습니다: ${error.message.split('\n')[0]}`;
    } finally {
        // UI 다시 활성화
        convertBtn.disabled = false;
        progressBarContainer.style.display = 'none';
    }
});



// 페이지 로드 시 FFmpeg 초기화
loadFFmpeg();
