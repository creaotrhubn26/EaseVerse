Pod::Spec.new do |s|
  s.name = 'EaseVerseMetronome'
  s.version = '1.0.0'
  s.summary = 'Native sample-clock click for EaseVerse'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'CREATORHUB AS'
  s.homepage = 'https://easeverse.netlify.app'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/creaotrhubn26/EaseVerse.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
