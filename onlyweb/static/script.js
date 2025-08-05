const { createFFmpeg, fetchFile } = FFmpeg;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const dropZoneContent = document.getElementById('drop-zone-content');
const dropZoneText = document.getElementById('drop-zone-text');
const fileInputBtn = document.getElementById('file-input-btn');
const fileInput = document.getElementById('file-input');
const convertBtn = document.getElementById('convert-btn');
const outputFormatSelect = document.getElementById('output-format');
const bitrateSelect = document.getElementById('bitrate');
const statusText = document.getElementById('status-text');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const downloadLink = document.getElementById('download-link');

let ffmpeg;
let selectedFile = null;
const originalDropZoneHTML = dropZoneContent.innerHTML;

// 1. FFmpeg 로드
async function loadFFmpeg() {
    try {
        ffmpeg = createFFmpeg({
            log: true, // 콘솔에 FFmpeg 로그 출력
            progress: ({ ratio }) => {
                // 변환 진행률 업데이트
                if (ratio >= 0 && ratio <= 1) {
                    const percent = Math.round(ratio * 100);
                    progressBar.style.width = `${percent}%`;
                    progressBar.textContent = `${percent}%`;
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
        // 드롭존 내용 업데이트
        dropZoneText.innerHTML = `<span class="file-name">${file.name}</span>`;
        fileInputBtn.textContent = '다른 파일 선택'; // 버튼 텍스트 변경

        convertBtn.disabled = false;
        statusText.textContent = '옵션을 확인하고 변환 버튼을 누르세요.';
        downloadLink.classList.add('hidden'); // 이전 다운로드 링크 숨기기
    } else {
        selectedFile = null;
        convertBtn.disabled = true;
        statusText.textContent = `오류: 지원하지 않는 파일 형식입니다. (${supportedExtensions.join(', ')})`;
        // 드롭존 초기화
        dropZoneContent.innerHTML = originalDropZoneHTML;
    }
}

// 파일 선택 버튼 클릭
fileInputBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 부모인 drop-zone의 클릭 이벤트 방지
    fileInput.click();
});
fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

// 드래그 앤 드롭 이벤트
dropZone.addEventListener('click', () => fileInput.click()); // 드롭존 전체 클릭 시 파일 선택

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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
        e.dataTransfer.clearData();
    }
});

// 파일명에서 OS 예약 문자를 '_'로 안전하게 치환하는 함수
function sanitizeForFilename(name) {
    // Windows 및 다른 OS에서 금지하는 주요 문자들: \ / : * ? " < > |
    return name.replace(/[\\/:\*?"<>\|]/g, '_');
}

// 3. 변환 실행
convertBtn.addEventListener('click', async () => {
    if (!selectedFile || !ffmpeg || !ffmpeg.isLoaded()) {
        statusText.textContent = '오류: FFmpeg가 로드되지 않았거나 파일이 선택되지 않았습니다.';
        return;
    }

    // UI 비활성화 및 상태 초기화
    convertBtn.disabled = true;
    const convertIcon = convertBtn.querySelector('i');
    convertIcon.classList.add('fa-spin');

    downloadLink.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    statusText.textContent = '변환 준비 중...';

    try {
        const inputExtension = selectedFile.name.split('.').pop();
        const internalInputName = `input.${inputExtension}`;
        
        const outputFormat = outputFormatSelect.value;
        const internalOutputName = `output.${outputFormat}`;

        const originalBaseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
        const sanitizedBaseName = sanitizeForFilename(originalBaseName);
        const finalDownloadName = `${sanitizedBaseName}.${outputFormat}`;
        
        const bitrate = bitrateSelect.value;

        statusText.textContent = '파일을 메모리에 쓰는 중...';
        ffmpeg.FS('writeFile', internalInputName, await fetchFile(selectedFile));

        const command = [
            '-i', internalInputName,
            '-c:a', outputFormat === 'm4a' ? 'aac' : 'libmp3lame',
            '-b:a', bitrate,
            '-ar', '44100',
            '-ac', '2',
            internalOutputName
        ];

        statusText.textContent = '변환 중... (파일 크기에 따라 시간이 걸릴 수 있습니다)';
        await ffmpeg.run(...command);

        statusText.textContent = '결과를 처리하는 중...';
        const data = ffmpeg.FS('readFile', internalOutputName);

        const blob = new Blob([data.buffer], { type: `audio/${outputFormat === 'm4a' ? 'mp4' : 'mpeg'}` });
        const url = URL.createObjectURL(blob);

        downloadLink.href = url;
        downloadLink.download = finalDownloadName;
        downloadLink.click(); 

        statusText.textContent = '변환 완료! 다운로드가 자동으로 시작됩니다.';

        ffmpeg.FS('unlink', internalInputName);
        ffmpeg.FS('unlink', internalOutputName);

        // 잠시 후 URL 해제 (다운로드를 위해 약간의 시간 부여)
        setTimeout(() => URL.revokeObjectURL(url), 60000);

    } catch (error) {
        console.error('변환 오류:', error);
        statusText.textContent = `오류가 발생했습니다: ${error.message.split('\n')[0]}`;
    } finally {
        // UI 다시 활성화 (변환 버튼은 파일이 선택된 상태이므로 활성화)
        convertBtn.disabled = false;
        progressContainer.classList.add('hidden');
        convertIcon.classList.remove('fa-spin');
    }
});

// 페이지 로드 시 FFmpeg 초기화
loadFFmpeg();
