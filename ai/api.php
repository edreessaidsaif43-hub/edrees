<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-File-Name, X-File-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

const MAX_UPLOAD_SIZE = 629145600; // 600 MB

$root = __DIR__;
$dataDir = $root . DIRECTORY_SEPARATOR . 'data';
$uploadDir = $root . DIRECTORY_SEPARATOR . 'uploads';
$dbFile = $dataDir . DIRECTORY_SEPARATOR . 'database.json';

if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);
if (!is_dir($uploadDir)) mkdir($uploadDir, 0775, true);

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): void {
    respond($status, ['error' => $message]);
}

function default_db(): array {
    return ['nextLessonId' => 1, 'nextAttachmentId' => 1, 'lessons' => [], 'attachments' => []];
}

function load_db(string $dbFile): array {
    if (!file_exists($dbFile)) return default_db();
    $raw = file_get_contents($dbFile);
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) return default_db();
    return array_merge(default_db(), $data);
}

function save_db(string $dbFile, array $db): void {
    file_put_contents($dbFile, json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
}

function safe_file_name(string $name): string {
    $name = rawurldecode($name ?: 'upload.bin');
    $name = preg_replace('/[<>:"\/\\|?*\x00-\x1F]/u', '_', $name);
    $name = trim($name ?: 'upload.bin');
    return function_exists('mb_substr') ? mb_substr($name, 0, 180, 'UTF-8') : substr($name, 0, 180);
}

function decode_meta(): array {
    $raw = $_GET['meta'] ?? '';
    if ($raw === '') return [];
    $b64 = strtr($raw, '-_', '+/');
    $b64 .= str_repeat('=', (4 - strlen($b64) % 4) % 4);
    $json = rawurldecode(base64_decode($b64) ?: '{}');
    $data = json_decode($json, true);
    return is_array($data) ? $data : [];
}

function read_json_body(): array {
    $raw = file_get_contents('php://input') ?: '{}';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function today_arabic(): string {
    return date('Y-m-d');
}

function extract_text(string $filePath, string $fileName, string $fileType, int $fileSize, array $fields): string {
    $manualText = trim((string)($fields['extractedText'] ?? ''));
    if ($manualText !== '') return $manualText;
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    if (($ext === 'txt' || strpos($fileType, 'text/') === 0) && $fileSize <= 2 * 1024 * 1024) {
        return file_get_contents($filePath) ?: '';
    }
    return implode("\n", [
        '[محتوى المرفق: ' . $fileName . ']',
        'تم حفظ الملف في قاعدة البيانات بنجاح.',
        'حجم الملف: ' . number_format($fileSize / 1048576, 1) . ' MB',
        'الوحدة: ' . ($fields['unit'] ?? ''),
        'المادة: ' . ($fields['subject'] ?? ''),
        'الصف: ' . ($fields['grade'] ?? ''),
        '',
        'ملاحظة: لاستخراج نصوص PDF/DOCX كبيرة بدقة يمكن إضافة خدمة استخراج نصوص لاحقًا.'
    ]);
}

function receive_upload(string $uploadDir, string $root, array $meta): array {
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > MAX_UPLOAD_SIZE) fail(413, 'حجم الملف أكبر من 600 MB');

    $fileName = safe_file_name($_SERVER['HTTP_X_FILE_NAME'] ?? 'upload.bin');
    $fileType = rawurldecode($_SERVER['HTTP_X_FILE_TYPE'] ?? 'application/octet-stream');
    $storedName = time() . '-' . random_int(100000, 999999) . '-' . $fileName;
    $absolutePath = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
    $input = fopen('php://input', 'rb');
    $output = fopen($absolutePath, 'wb');
    if (!$input || !$output) fail(500, 'تعذر حفظ الملف');

    $size = 0;
    while (!feof($input)) {
        $chunk = fread($input, 1048576);
        if ($chunk === false) break;
        $size += strlen($chunk);
        if ($size > MAX_UPLOAD_SIZE) {
            fclose($input);
            fclose($output);
            @unlink($absolutePath);
            fail(413, 'حجم الملف أكبر من 600 MB');
        }
        fwrite($output, $chunk);
    }
    fclose($input);
    fclose($output);

    $relativePath = 'uploads/' . $storedName;
    return [
        'fileName' => $fileName,
        'fileType' => $fileType,
        'fileSize' => $size,
        'filePath' => $relativePath,
        'extractedText' => extract_text($absolutePath, $fileName, $fileType, $size, $meta)
    ];
}

$path = $_GET['path'] ?? ($_GET['route'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];
$db = load_db($dbFile);

try {
    if ($method === 'GET' && $path === '/api/lessons') {
        $lessons = array_reverse($db['lessons']);
        $attachments = array_reverse($db['attachments']);
        respond(200, ['lessons' => $lessons, 'attachments' => $attachments]);
    }

    if ($method === 'POST' && $path === '/api/lessons/single') {
        $meta = decode_meta();
        foreach (['grade','subject','semester','unit','title'] as $field) {
            if (empty($meta[$field])) fail(400, 'يرجى تعبئة جميع الحقول المطلوبة');
        }
        $upload = receive_upload($uploadDir, $root, $meta);
        $attachmentId = $db['nextAttachmentId']++;
        $db['attachments'][] = [
            'id' => $attachmentId,
            'title' => $meta['unit'] . ' - ' . $meta['title'],
            'fileName' => $upload['fileName'],
            'fileType' => $upload['fileType'],
            'fileSize' => $upload['fileSize'],
            'filePath' => $upload['filePath'],
            'extractedText' => $upload['extractedText'],
            'createdAt' => date('c')
        ];
        $db['lessons'][] = [
            'id' => $db['nextLessonId']++,
            'grade' => $meta['grade'],
            'subject' => $meta['subject'],
            'semester' => $meta['semester'],
            'unit' => $meta['unit'],
            'title' => $meta['title'],
            'attachmentId' => $attachmentId,
            'status' => $meta['status'] ?? 'active',
            'createdAt' => today_arabic()
        ];
        save_db($dbFile, $db);
        respond(200, ['ok' => true]);
    }

    if ($method === 'POST' && $path === '/api/lessons/multi') {
        $meta = decode_meta();
        $titles = array_values(array_filter(array_map('trim', $meta['titles'] ?? [])));
        if (empty($meta['grade']) || empty($meta['subject']) || empty($meta['semester']) || empty($meta['unit']) || count($titles) === 0) {
            fail(400, 'يرجى تعبئة البيانات وإضافة درس واحد على الأقل');
        }
        $upload = receive_upload($uploadDir, $root, $meta);
        $attachmentId = $db['nextAttachmentId']++;
        $db['attachments'][] = [
            'id' => $attachmentId,
            'title' => $meta['unit'],
            'fileName' => $upload['fileName'],
            'fileType' => $upload['fileType'],
            'fileSize' => $upload['fileSize'],
            'filePath' => $upload['filePath'],
            'extractedText' => $upload['extractedText'],
            'createdAt' => date('c')
        ];
        foreach ($titles as $title) {
            $db['lessons'][] = [
                'id' => $db['nextLessonId']++,
                'grade' => $meta['grade'],
                'subject' => $meta['subject'],
                'semester' => $meta['semester'],
                'unit' => $meta['unit'],
                'title' => $title,
                'attachmentId' => $attachmentId,
                'status' => 'active',
                'createdAt' => today_arabic()
            ];
        }
        save_db($dbFile, $db);
        respond(200, ['ok' => true]);
    }

    if (preg_match('#^/api/lessons/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $index = null;
        foreach ($db['lessons'] as $i => $lesson) {
            if ((int)$lesson['id'] === $id) { $index = $i; break; }
        }
        if ($index === null) fail(404, 'لم يتم العثور على الدرس');

        if ($method === 'PUT') {
            $body = read_json_body();
            foreach (['title','unit','status'] as $field) {
                if (isset($body[$field])) $db['lessons'][$index][$field] = $body[$field];
            }
            save_db($dbFile, $db);
            respond(200, ['ok' => true]);
        }

        if ($method === 'DELETE') {
            $attachmentId = $db['lessons'][$index]['attachmentId'];
            array_splice($db['lessons'], $index, 1);
            $stillUsed = false;
            foreach ($db['lessons'] as $lesson) {
                if ((int)$lesson['attachmentId'] === (int)$attachmentId) { $stillUsed = true; break; }
            }
            if (!$stillUsed) {
                foreach ($db['attachments'] as $i => $attachment) {
                    if ((int)$attachment['id'] === (int)$attachmentId) {
                        $filePath = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $attachment['filePath']);
                        if (is_file($filePath)) @unlink($filePath);
                        array_splice($db['attachments'], $i, 1);
                        break;
                    }
                }
            }
            save_db($dbFile, $db);
            respond(200, ['ok' => true]);
        }
    }

    if ($method === 'GET' && $path === '/api/export') {
        respond(200, ['lessons' => $db['lessons'], 'attachments' => $db['attachments'], 'exportedAt' => date('c')]);
    }

    fail(404, 'المسار غير موجود');
} catch (Throwable $e) {
    fail(500, $e->getMessage());
}
