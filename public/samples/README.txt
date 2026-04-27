Образцы документов для клиентского кабинета.

Поддержка: PDF, JPG, JPEG, PNG. Имена должны совпадать с samplePath
из app/client/mock-data.ts:

  passport.jpg     — образец паспорта        ✅
  diploma.jpg      — образец диплома         ✅
  transcript.jpg   — образец транскрипта     ✅
  attestat.jpeg    — образец аттестата       ✅
  ielts.jpg        — образец IELTS/TOEFL     ✅
  recomm.pdf       — рекомендательное письмо ✅

Когда файла нет — модалка покажет CSS-плейсхолдер «Пример».
Чтобы заменить образец — перезапиши файл (deploy подхватит).
Если меняешь расширение, поправь samplePath в mock-data.ts.
