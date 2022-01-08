# Shellshare

In order to share your shell, use `script -F | tee /dev/tty | curl --no-progress-meter -T - localhost:3000`
https://stackoverflow.com/questions/31504531/is-it-possible-to-upload-a-file-with-curl-from-a-pipe
