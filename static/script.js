// --- 전역 변수 ---
const API_BASE_URL = 'https://q496qaqhdh.execute-api.ap-northeast-2.amazonaws.com';
let currentS3Key = null;
let currentTrimmedS3Key = null;
let audioDuration = 0;
let timelineWidth = 0;

// 드래그/리사이징 상태 관리 변수
let isDraggingSelection = false;
let isResizing = null; // 'start' 또는 'end'
let dragStartX = 0;
const CLICK_THRESHOLD = 5; // 클릭으로 간주할 드래그 거리 (px)

// 부드러운 재생 시간 업데이트를 위한 변수
let animationFrameId = null;


// --- DOM 요소 ---
const uploadArea = document.getElementById('uploadArea');
const uploadSection = document.getElementById('uploadSection');
const fileInput = document.getElementById('fileInput');
const status = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const audioInfo = document.getElementById('audioInfo');
const trimControls = document.getElementById('trimControls');
const downloadSection = document.getElementById('downloadSection');

// 오디오 플레이어 & 타임라인
const audioPlayer = document.getElementById('audioPlayer');
const playPauseBtn = document.getElementById('playPauseBtn');
const timelineContainer = document.getElementById('timelineContainer');
const timeline = document.getElementById('timeline');
const progress = document.getElementById('progress');
const selection = document.getElementById('selection');
const startHandle = document.getElementById('startHandle');
const endHandle = document.getElementById('endHandle');
const seekHandle = document.getElementById('seekHandle');
const currentTimeDisplay = document.getElementById('currentTime');
const totalDurationDisplay = document.getElementById('totalDuration');
const selectedRangeDisplay = document.getElementById('selectedRange');

// 시간 입력
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');

// 볼륨 조절
const volumeLevelSlider = document.getElementById('volume_level');
const volumeValueDisplay = document.getElementById('volume_value');


const PAUSE_ICON = 'pause icon';
const PLAY_ICON = 'play icon';

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', function () {
    // Semantic UI 초기화
    $('#progressBar').progress({ percent: 0 });
    $('.ui.checkbox').checkbox();
    $('.menu .item').tab();

    initializeEventListeners();
    updateTimelineWidth();
});

function initializeEventListeners() {
    // 파일 업로드 이벤트
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // 외부 소스 가져오기 이벤트
    document.getElementById('youtubeSubmit').addEventListener('click', handleYoutubeSubmit);
    document.getElementById('soundcloudSubmit').addEventListener('click', handleSoundCloudSubmit);

    // 오디오 플레이어 이벤트
    audioPlayer.addEventListener('loadedmetadata', handleAudioLoaded);
    audioPlayer.addEventListener('ended', handleAudioEnded);
    playPauseBtn.addEventListener('click', togglePlayPause);

    // 시간 입력 이벤트
    startTimeInput.addEventListener('input', handleTimeInputChange);
    endTimeInput.addEventListener('input', handleTimeInputChange);

    // 볼륨 조절 이벤트
    volumeLevelSlider.addEventListener('input', () => {
        const volume = parseFloat(volumeLevelSlider.value);
        const volumeCheckbox = $('#volume_check').parent('.checkbox');

        // 소수점 첫째 자리까지 표시하고, 양수일 때 + 기호 추가
        const formattedVolume = volume.toFixed(1);
        volumeValueDisplay.textContent = volume > 0 ? `+${formattedVolume}` : formattedVolume;

        // 볼륨이 0이면 체크 해제, 아니면 체크
        if (Math.abs(volume) < 0.01) { // 부동소수점 비교를 위해 작은 수보다 작은지 확인
            volumeCheckbox.checkbox('set unchecked');
        } else {
            volumeCheckbox.checkbox('set checked');
        }
    });

    // 타임라인 이벤트
    timeline.addEventListener('mousedown', handleTimelineMouseDown);
    startHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isResizing = 'start';
    });
    endHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isResizing = 'end';
    });
    document.addEventListener('mousemove', handleTimelineMouseMove);
    document.addEventListener('mouseup', handleTimelineMouseUp);

    // 리사이즈 이벤트
    window.addEventListener('resize', updateTimelineWidth);

    // 오디오 플레이어 에러 이벤트 (디버깅용)
    audioPlayer.addEventListener('error', (e) => {
        console.error('오디오 플레이어 오류 발생:', e);
        let errorDetails = '알 수 없는 오디오 오류';
        if (audioPlayer.error) {
            switch (audioPlayer.error.code) {
                case 1: errorDetails = '오디오 로딩이 중단되었습니다 (MEDIA_ERR_ABORTED)'; break;
                case 2: errorDetails = '네트워크 오류로 인해 오디오를 다운로드할 수 없습니다 (MEDIA_ERR_NETWORK)'; break;
                case 3: errorDetails = '오디오 파일이 손상되었거나, 브라우저가 지원하지 않는 형식입니다 (MEDIA_ERR_DECODE)'; break;
                case 4: errorDetails = '오디오를 불러올 수 없습니다. 서버, 네트워크, 또는 파일 형식 문제일 수 있습니다 (MEDIA_ERR_SRC_NOT_SUPPORTED)'; break;
            }
        }
        showStatus(`오류: ${errorDetails}`, 'negative');
    });
}

function updateTimelineWidth() {
    timelineWidth = timeline.offsetWidth;
}

// --- 파일 업로드 처리 ---
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('active');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('active');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

async function handleFileUpload(file) {
    resetAll(false);

    const MAX_SIZE = 6 * 1024 * 1024; // API Gateway payload limit
    if (file.size > MAX_SIZE) {
        showStatus('파일 크기는 6MB를 초과할 수 없습니다. (서버리스 제약)', 'negative');
        return;
    }

    showStatus('서버로 파일 업로드 중...', 'info');
    showProgress(0, '파일 업로드 중...');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE_URL}/upload-audio/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || '업로드 실패');
        }

        const data = await response.json();
        currentS3Key = data.s3_key;
        
        // The backend now returns the public URL directly
        audioPlayer.src = data.download_url;

        showStatus('오디오 정보 로딩 중...', 'info');
        showProgress(50, '오디오 처리 중...');

        document.getElementById('fileName').textContent = data.filename;
        document.getElementById('duration').textContent = formatTime(data.duration);
        const format = data.filename.split('.').pop();
        document.getElementById('format').textContent = format ? format.toUpperCase() : 'N/A';

    } catch (error) {
        showStatus('오류: ' + error.message, 'negative');
        hideProgress();
    }
}

// --- 오디오 플레이어 처리 ---
function handleAudioLoaded() {
    console.log('[디버그] 오디오 메타데이터 로드 성공! (handleAudioLoaded 호출됨)');
    audioDuration = audioPlayer.duration;
    updateTimelineWidth();

    totalDurationDisplay.textContent = formatTime(audioDuration);
    updateTime(0);

    startTimeInput.value = audioDuration === 0 ? '0.000' : (0).toFixed(3);
    endTimeInput.value = audioDuration.toFixed(3);
    endTimeInput.max = audioDuration;
    startTimeInput.max = audioDuration;

    updateSelectionFromInputs();
    updateSeekHandle();
    generateTimelineGrid();

    showStatus('오디오 로딩 완료!', 'positive');
    hideProgress();
    document.getElementById('initial-view').classList.add('hidden');
    audioInfo.classList.remove('hidden');
    trimControls.classList.remove('hidden');

    selection.style.display = 'none';
}

function updateProgressSmoothly() {
    if (!isDraggingSelection && !isResizing) {
        updateTime(audioPlayer.currentTime);
    }

    if (!audioPlayer.paused) {
        const endTime = parseFloat(endTimeInput.value);
        if (selection.style.display !== 'none' && audioPlayer.currentTime >= endTime) {
            audioPlayer.pause();
            audioPlayer.currentTime = endTime;
            updateTime(endTime);
            playPauseBtn.querySelector('i').className = PLAY_ICON;
            cancelAnimationFrame(animationFrameId);
        } else {
            animationFrameId = requestAnimationFrame(updateProgressSmoothly);
        }
    } else {
        cancelAnimationFrame(animationFrameId);
    }
}

function handleAudioEnded() {
    playPauseBtn.querySelector('i').className = PLAY_ICON;
    cancelAnimationFrame(animationFrameId);
}

function togglePlayPause() {
    const startTime = parseFloat(startTimeInput.value);
    const endTime = parseFloat(endTimeInput.value);

    if (audioPlayer.paused) {
        if (selection.style.display !== 'none' && (audioPlayer.currentTime < startTime || audioPlayer.currentTime >= endTime)) {
            audioPlayer.currentTime = startTime;
        }
        audioPlayer.play().then(() => {
            playPauseBtn.querySelector('i').className = PAUSE_ICON;
            animationFrameId = requestAnimationFrame(updateProgressSmoothly);
        }).catch(error => {
            showStatus('오디오 재생 실패: ' + error.message, 'negative');
        });
    } else {
        audioPlayer.pause();
        playPauseBtn.querySelector('i').className = PLAY_ICON;
        cancelAnimationFrame(animationFrameId);
    }
}

// --- UI 업데이트 함수 ---
function updateTime(time) {
    currentTimeDisplay.textContent = formatTime(time);
    updateSeekHandle();
}

function updateSeekHandle() {
    if (audioDuration > 0) {
        const progressPercent = (audioPlayer.currentTime / audioDuration) * 100;
        progress.style.width = `${progressPercent}%`;
        seekHandle.style.left = `calc(${progressPercent}% - 2px)`;
    }
}

function updateSelectionFromInputs() {
    const start = parseFloat(startTimeInput.value);
    const end = parseFloat(endTimeInput.value);

    if (audioDuration > 0 && !isNaN(start) && !isNaN(end)) {
        const startPercent = (start / audioDuration) * 100;
        const endPercent = (end / audioDuration) * 100;

        selection.style.left = `${startPercent}%`;
        selection.style.width = `${endPercent - startPercent}%`;
        selectedRangeDisplay.textContent = `선택 구간: ${formatTime(start)} - ${formatTime(end)}`;
    }
}

function updateInputsFromSelection() {
    const selectionLeft = selection.offsetLeft;
    const selectionWidth = selection.offsetWidth;

    if (timelineWidth > 0) {
        const start = (selectionLeft / timelineWidth) * audioDuration;
        const end = ((selectionLeft + selectionWidth) / timelineWidth) * audioDuration;

        startTimeInput.value = start.toFixed(3);
        endTimeInput.value = end.toFixed(3);
        selectedRangeDisplay.textContent = `선택 구간: ${formatTime(start)} - ${formatTime(end)}`;
    }
}

function handleTimeInputChange() {
    let start = parseFloat(startTimeInput.value);
    let end = parseFloat(endTimeInput.value);

    if (isNaN(start) || isNaN(end)) return;

    if (start < 0) start = 0;
    if (end > audioDuration) end = audioDuration;
    if (start >= end) {
        if (event.target.id === 'startTime') {
            end = Math.min(start + 0.1, audioDuration);
        } else {
            start = Math.max(end - 0.1, 0);
        }
    }

    startTimeInput.value = start.toFixed(3);
    endTimeInput.value = end.toFixed(3);
    updateSelectionFromInputs();

    if (selection.style.display === 'none') {
        selection.style.display = 'block';
    }
}

// --- 타임라인 눈금 생성 ---
function generateTimelineGrid() {
    const timelineGrid = document.getElementById('timelineGrid');
    timelineGrid.innerHTML = '';

    if (audioDuration <= 0) return;

    let interval;
    if (audioDuration <= 30) interval = 5;
    else if (audioDuration <= 60) interval = 10;
    else if (audioDuration <= 180) interval = 30;
    else interval = 60;

    const gridSteps = Math.floor(audioDuration / interval);

    for (let i = 0; i <= gridSteps; i++) {
        const time = i * interval;
        if (time > audioDuration) continue;

        const position = (time / audioDuration) * 100;

        const gridLine = document.createElement('div');
        gridLine.className = 'grid-line';
        gridLine.style.left = `${position}%`;

        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.style.left = `${position}%`;
        timeLabel.textContent = formatTime(time, true);

        timelineGrid.appendChild(gridLine);
        timelineGrid.appendChild(timeLabel);
    }
}

// --- 타임라인 드래그 처리 ---
function getRelativePosition(e) {
    const rect = timeline.getBoundingClientRect();
    return Math.max(0, Math.min(e.clientX - rect.left, rect.width));
}

function handleTimelineMouseDown(e) {
    if (e.target.classList.contains('timeline-handle') || e.target.classList.contains('timeline-seek-handle')) {
        return;
    }
    e.preventDefault();

    if (!audioPlayer.paused) {
        audioPlayer.pause();
        playPauseBtn.querySelector('i').className = PLAY_ICON;
        cancelAnimationFrame(animationFrameId);
    }

    updateTimelineWidth();
    isDraggingSelection = true;
    dragStartX = getRelativePosition(e);

    selection.style.display = 'block';
    selection.style.left = dragStartX + 'px';
    selection.style.width = '0px';
}

function handleTimelineMouseMove(e) {
    if (!isDraggingSelection && !isResizing) return;
    e.preventDefault();
    const currentX = getRelativePosition(e);

    if (isDraggingSelection) {
        const left = Math.min(dragStartX, currentX);
        const width = Math.abs(currentX - dragStartX);
        selection.style.left = left + 'px';
        selection.style.width = width + 'px';
        updateInputsFromSelection();
    } else if (isResizing) {
        const selectionLeftPx = selection.offsetLeft;
        const selectionWidthPx = selection.offsetWidth;

        if (isResizing === 'start') {
            const oldRightPx = selectionLeftPx + selectionWidthPx;
            const newLeftPx = Math.min(currentX, oldRightPx - 10);
            const newWidthPx = oldRightPx - newLeftPx;
            selection.style.left = newLeftPx + 'px';
            selection.style.width = newWidthPx + 'px';
        } else { // 'end'
            const newWidthPx = Math.max(currentX - selectionLeftPx, 10);
            selection.style.width = newWidthPx + 'px';
        }
        updateInputsFromSelection();
    }
}

function handleTimelineMouseUp(e) {
    if (isDraggingSelection) {
        const finalWidth = selection.offsetWidth;
        if (finalWidth < CLICK_THRESHOLD) {
            const clickedTime = (dragStartX / timelineWidth) * audioDuration;
            audioPlayer.currentTime = clickedTime;
            updateTime(clickedTime);
            selection.style.display = 'none';
        } else {
            updateInputsFromSelection();
        }
    }
    isDraggingSelection = false;
    isResizing = null;
}

// --- 오디오 트림 처리 ---
async function trimAudio() {
    if (!audioPlayer.paused) {
        audioPlayer.pause();
        playPauseBtn.querySelector('i').className = PLAY_ICON;
        cancelAnimationFrame(animationFrameId);
    }

    const startTime = parseFloat(startTimeInput.value);
    const endTime = parseFloat(endTimeInput.value);

    if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
        showStatus('시작 시간이 끝 시간보다 작아야 합니다.', 'negative');
        return;
    }

    if (selection.style.display === 'none') {
        showStatus('먼저 타임라인에서 자를 구간을 선택해주세요.', 'warning');
        return;
    }

    showStatus('M4A 256kbps로 오디오 자르는 중...', 'info');
    showProgress(50, '오디오 자르는 중...');

    const trimBtn = event.target;
    trimBtn.classList.add('loading', 'disabled');

    const addEndingSound = $('#addEndingSound').parent('.checkbox').checkbox('is checked');
    const addStartingSound = $('#addStartingSound').parent('.checkbox').checkbox('is checked');
    const volumeCheck = $('#volume_check').parent('.checkbox').checkbox('is checked');
    const volumeLevel = document.getElementById('volume_level').value;

    const formData = new FormData();
    formData.append('s3_key', currentS3Key);
    formData.append('start_time', startTime);
    formData.append('end_time', endTime);
    formData.append('add_ending_sound', addEndingSound);
    formData.append('add_starting_sound', addStartingSound);
    formData.append('volume_check', volumeCheck);
    formData.append('volume_level', volumeLevel);

    try {
        const response = await fetch(`${API_BASE_URL}/trim-audio/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || '자르기 실패');
        }

        const data = await response.json();
        currentTrimmedS3Key = data.edited_s3_key;

        const downloadInfoHtml = `
            편집 완료! (결과: ${formatTime(data.trimmed_duration)})
        `;
        document.getElementById('downloadInfo').innerHTML = downloadInfoHtml;
        document.getElementById('downloadBtn').onclick = () => downloadFile(currentTrimmedS3Key);

        showStatus('편집이 완료되었습니다!', 'positive');
        hideProgress();
        
        $('#downloadModal').modal({
            closable: false,
            onDeny: function() {
                resetAll();
                return true;
            },
            onApprove: function() {
                downloadFile(currentTrimmedS3Key);
                return false; 
            }
        }).modal('show');

    } catch (error) {
        showStatus('오류: ' + error.message, 'negative');
        hideProgress();
    } finally {
        trimBtn.classList.remove('loading', 'disabled');
    }
}

async function downloadFile(s3Key) {
    try {
        const response = await fetch(`${API_BASE_URL}/generate-download-url/?s3_key=${encodeURIComponent(s3Key)}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || '다운로드 링크 생성 실패');
        }
        window.location.href = data.download_url;
    } catch (error) {
        showStatus('다운로드 오류: ' + error.message, 'negative');
    }
}

// --- 유틸리티 함수 ---
function formatTime(seconds, short = false) {
    if (isNaN(seconds) || seconds < 0) {
        return '00:00.000';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (short && mins === 0) {
        return Math.floor(secs);
    }
    
    const formattedMinutes = String(mins).padStart(2, '0');
    const formattedSeconds = secs.toFixed(3).padStart(6, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
}

function showStatus(message, type) {
    status.className = `ui message ${type}`;
    status.textContent = message;
    status.classList.remove('hidden');
}

function showProgress(percent, label = '') {
    progressBar.classList.remove('hidden');
    $('#progressBar').progress({ percent: percent, text: { active: label } });
}

function hideProgress() {
    progressBar.classList.add('hidden');
}

function resetAll(showMessage = true) {
    if ($ && $.fn.modal) {
        $('#downloadModal').modal('hide');
    }

    currentS3Key = null;
    currentTrimmedS3Key = null;
    audioDuration = 0;
    isDraggingSelection = false;
    isResizing = null;
    dragStartX = 0;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    const initialView = document.getElementById('initial-view');
    if (initialView) initialView.classList.remove('hidden');
    
    if (audioInfo) audioInfo.classList.add('hidden');
    if (trimControls) trimControls.classList.add('hidden');
    if (downloadSection) downloadSection.classList.add('hidden');
    if (status) status.classList.add('hidden');
    
    hideProgress();

    if (audioPlayer) {
        // Stop playback and reset the source correctly to prevent errors
        audioPlayer.pause();
        audioPlayer.removeAttribute('src');
        audioPlayer.load();
        audioPlayer.currentTime = 0;
    }
    if (playPauseBtn && playPauseBtn.querySelector('i')) {
        playPauseBtn.querySelector('i').className = PLAY_ICON;
    }

    if (fileInput) fileInput.value = '';
    if (startTimeInput) startTimeInput.value = '0.000';
    if (endTimeInput) endTimeInput.value = '0.000';
    
    if ($ && $.fn.checkbox) {
        $('#addStartingSound').parent('.checkbox').checkbox('set unchecked');
        $('#addEndingSound').parent('.checkbox').checkbox('set checked');
        $('#volume_check').parent('.checkbox').checkbox('set checked');
    }
    
    if (volumeLevelSlider) volumeLevelSlider.value = 2.0;
    if (volumeValueDisplay) volumeValueDisplay.textContent = '+2.0';


    if (progress) progress.style.width = '0%';
    if (selection) {
        selection.style.width = '0%';
        selection.style.left = '0%';
        selection.style.display = 'none';
    }
    if (seekHandle) seekHandle.style.left = '-2px';
    
    if (selectedRangeDisplay) selectedRangeDisplay.textContent = `선택 구간: ${formatTime(0)} - ${formatTime(0)}`;
    if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(0);
    if (totalDurationDisplay) totalDurationDisplay.textContent = formatTime(0);

    const timelineGrid = document.getElementById('timelineGrid');
    if (timelineGrid) {
        timelineGrid.innerHTML = '';
    }

    if (showMessage) {
        showStatus('새로운 파일을 업로드해주세요.', 'info');
        setTimeout(() => {
            if (status) status.classList.add('hidden');
        }, 3000);
    }
}

// --- YouTube 처리 ---
async function handleYoutubeSubmit() {
    const urlInput = document.getElementById('youtubeUrl');
    const url = urlInput.value.trim();
    const submitBtn = document.getElementById('youtubeSubmit');

    if (!url) {
        showStatus('YouTube URL을 입��해주세요.', 'negative');
        return;
    }

    resetAll(false);
    showStatus('YouTube 오디오 다운로드 중... (시간이 걸릴 수 있습니다)', 'info');
    showProgress(25, '다운로드 시작...');
    submitBtn.classList.add('loading', 'disabled');

    try {
        const response = await fetch(`${API_BASE_URL}/download-youtube/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || '다운로드 실패');
        }

        const data = await response.json();
        console.log('[디버그] 서버 응답 받음:', data);
        
        currentS3Key = data.s3_key;
        // The backend now returns the public URL directly
        console.log('[디버그] 오디오 플레이어 소스 설정 시도:', data.download_url);
        audioPlayer.src = data.download_url;

        showStatus('오디오 정보 로딩 중...', 'info');
        showProgress(75, '오디오 처리 중...');

        document.getElementById('fileName').textContent = data.filename;
        document.getElementById('duration').textContent = formatTime(data.duration);
        const format = data.filename.split('.').pop();
        document.getElementById('format').textContent = format ? format.toUpperCase() : 'N/A';

    } catch (error) {
        showStatus('오류: ' + error.message, 'negative');
        hideProgress();
    } finally {
        submitBtn.classList.remove('loading', 'disabled');
        urlInput.value = '';
    }
}

// --- SoundCloud 처리 ---
async function handleSoundCloudSubmit() {
    const urlInput = document.getElementById('soundcloudUrl');
    const url = urlInput.value.trim();
    const submitBtn = document.getElementById('soundcloudSubmit');

    if (!url) {
        showStatus('SoundCloud URL을 입력해주세요.', 'negative');
        return;
    }

    resetAll(false);
    showStatus('SoundCloud 오디오 다운로드 중... (시간이 걸릴 수 있습니다)', 'info');
    showProgress(25, '다운로드 시작...');
    submitBtn.classList.add('loading', 'disabled');

    try {
        const response = await fetch(`${API_BASE_URL}/download-soundcloud/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || '다운로드 실패');
        }

        const data = await response.json();
        currentS3Key = data.s3_key;
        audioPlayer.src = data.download_url;

        showStatus('오디오 정보 로딩 중...', 'info');
        showProgress(75, '오디오 처리 중...');

        document.getElementById('fileName').textContent = data.filename;
        document.getElementById('duration').textContent = formatTime(data.duration);
        const format = data.filename.split('.').pop();
        document.getElementById('format').textContent = format ? format.toUpperCase() : 'N/A';

    } catch (error) {
        showStatus('오류: ' + error.message, 'negative');
        hideProgress();
    } finally {
        submitBtn.classList.remove('loading', 'disabled');
        urlInput.value = '';
    }
}