<?php
require __DIR__ . '/auth.php';

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $config = ffb_config();
    if ($config === null) {
        $error = 'Site not configured yet: copy api/config.example.php to api/config.php and set site_password.';
    } else {
        $submitted = $_POST['password'] ?? '';
        if (hash_equals((string) $config['site_password'], (string) $submitted)) {
            $_SESSION['ffb_authed'] = true;
            header('Location: index.php');
            exit;
        }
        $error = 'Wrong password.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FFB — Sign in</title>
<link rel="stylesheet" href="style.css?v=4">
</head>
<body>
<div class="login-wrap">
  <form class="login-box" method="POST">
    <h1>FFB</h1>
    <p class="login-sub">Enter the password to view.</p>
    <input type="password" name="password" placeholder="Password" autofocus required>
    <?php if ($error): ?>
      <div class="comment-error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>
    <button type="submit">Enter</button>
  </form>
</div>
</body>
</html>
