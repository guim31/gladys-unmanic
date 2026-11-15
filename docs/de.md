# Unmanic

Bring deinen [Unmanic](https://docs.unmanic.app)-Server (den selbst
gehosteten Optimierer für Videobibliotheken) über dein lokales Netzwerk in
Gladys: wartende und laufende Aufgaben, die heute abgeschlossenen und
fehlgeschlagenen Aufgaben, Zustand und Fortschritt jedes Workers,
Pause-Schalter und Szenen, die reagieren, wenn eine Aufgabe fehlschlägt oder
die Warteschlange leer ist.

Die Integration wurde mit einem echten Unmanic-0.4.1-Server getestet (das
offizielle Docker-Image `josh5/unmanic`, mit echten Transcodierungen und einer
fehlgeschlagenen Aufgabe), noch nicht in einer echten Gladys-Installation:
Rückmeldungen sind im [Gladys-Forum](https://community.gladysassistant.com)
oder in den [Issues](https://github.com/guim31/gladys-unmanic/issues)
willkommen.

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Einen **Unmanic**-Server, den Gladys erreicht (gleiches Netzwerk), auf dem
  Port seiner Weboberfläche (standardmäßig `8888`).
- Unmanic hat **keine eigene Anmeldung**: Du musst nichts anlegen. Wenn ein
  Reverse-Proxy mit Basic Auth davorsteht, halte dessen Benutzernamen und
  Passwort bereit.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Adresse** des Unmanic-Servers ein (zum
   Beispiel `192.168.1.2:8888`; ohne Port wird `8888` verwendet). Hinter einem
   Reverse-Proxy die vollständige Adresse (`https://example.org/unmanic`) und,
   mit Basic Auth, **Benutzername (Reverse-Proxy)** und **Passwort
   (Reverse-Proxy)**.
3. Speichere und klicke auf **Verbindung testen**: Die Meldung unter der
   Schaltfläche nennt die Version von Unmanic, die Zahl der Worker und die
   wartenden Aufgaben.
4. Öffne den Tab **Entdecken**: ein Gerät für den Server, eins für die
   Warteschlange, eins pro Worker. Klicke bei den gewünschten auf
   **Hinzufügen**, wähle einen Raum und speichere.

Optionen:

- **Pause und Fortsetzen erlauben** (standardmäßig aus): Gladys darf die
  Worker pausieren und fortsetzen (Schalter, Szenen, Widget-Taste). Aus: Die
  Integration liest nur.
- **Aktualisierungsintervall**: 30 Sekunden bis 5 Minuten (standardmäßig 1
  Minute).
- **Sprache der Funktionsnamen**: die Namen der Funktionen beim Hinzufügen
  eines Geräts und die Sprache des Zusammenfassungssatzes.

## Die Geräte

**Der Unmanic-Server**

| Funktion                 | Was sie zeigt                                                               |
| ------------------------ | --------------------------------------------------------------------------- |
| **Online**               | 1, solange der Server antwortet.                                            |
| **Alle Worker pausiert** | Schalter: pausiert alle Worker oder setzt sie fort (1, wenn alle pausiert). |
| **Version**              | Version von Unmanic.                                                        |

**Die Unmanic-Warteschlange**

| Funktion                 | Was sie zeigt                                          |
| ------------------------ | ------------------------------------------------------ |
| **Wartende Aufgaben**    | Aufgaben, die auf einen Worker warten (Pending tasks). |
| **Laufende Aufgaben**    | Aufgaben, die gerade ein Worker bearbeitet.            |
| **Heute abgeschlossen**  | Seit Mitternacht erfolgreich abgeschlossene Aufgaben.  |
| **Heute fehlgeschlagen** | Seit Mitternacht fehlgeschlagene Aufgaben.             |

**Jeder Worker** (benannt wie in Unmanic, `Default-Worker-1`…)

| Funktion           | Was sie zeigt                                                     |
| ------------------ | ----------------------------------------------------------------- |
| **Aktiv**          | 1, solange der Worker eine Aufgabe bearbeitet.                    |
| **Pausiert**       | Schalter: pausiert diesen Worker oder setzt ihn fort.             |
| **Fortschritt**    | Fortschritt der Aufgabe in %, wenn das Unmanic-Plugin ihn meldet. |
| **Aktuelle Datei** | Name der Datei in Bearbeitung (`—` im Leerlauf).                  |

Ein pausierter Worker hält an, wo er gerade ist, und macht beim Fortsetzen an
derselben Stelle weiter: Nichts geht verloren. Ein Worker, der verschwindet
(Worker-Gruppe in Unmanic verkleinert oder umbenannt), bleibt offline in
Gladys.

## Dashboard

Das Widget **Unmanic** zeigt vier Kacheln (wartend, in Arbeit, heute fertig,
heute Fehler), eine Zeile pro Worker (Fortschritt und Datei, pausiert,
untätig) und eine Taste: **Alle pausieren**, solange die Worker laufen, **Alle
fortsetzen**, sobald alle pausiert sind. Keine Taste, wenn die Befehle in der
Konfiguration aus sind. Zwei Einstellungen des Widgets blenden die
Worker-Zeilen und die Taste aus.

## Szenen

### Auslöser

- **Unmanic-Warteschlange leer**: Alles ist erledigt, keine Aufgabe wartet und
  kein Worker arbeitet mehr. Variablen: die heute abgeschlossenen und
  fehlgeschlagenen Aufgaben.
- **Unmanic-Aufgabe fehlgeschlagen**: Eine Aufgabe ist gerade fehlgeschlagen.
  Variablen: der Dateiname, die heute fehlgeschlagenen Aufgaben.

### Aktionen

- **Unmanic pausieren**: ein Worker, oder alle, wenn keiner gewählt ist.
- **Unmanic fortsetzen**: gleiche Wahl.
- **Unmanic-Zusammenfassung lesen**: ein Satz für eine Nachricht oder
  Sprachansage („Unmanic: 12 wartende Aufgabe(n), 2 in Arbeit, 30 heute
  abgeschlossen, 1 heute fehlgeschlagen.“) und dieselben Werte als Zahlen.

Die Aktionen zum Pausieren und Fortsetzen brauchen **Pause und Fortsetzen
erlauben** in der Konfiguration.

### Szenen-Ideen

- Während der Hochtarifzeiten deines Stromvertrags **Unmanic pausieren**; zu
  Beginn der Niedertarifzeit **Unmanic fortsetzen**.
- **Unmanic-Aufgabe fehlgeschlagen** → eine Telegram-Nachricht mit dem
  Dateinamen.
- **Unmanic-Warteschlange leer** → eine Benachrichtigung: „Unmanic ist für
  heute fertig“.
- Am Abend **Unmanic pausieren**, damit die CPU für den Film frei bleibt, und
  nachts fortsetzen.

## Fehlerbehebung

- **„Unmanic antwortet nicht“**: Prüfe Adresse und Port (`8888`) und ob
  Gladys den Server erreicht (Firewall, Docker-Netzwerk).
- **„Zugriff verweigert“**: Ein Reverse-Proxy schützt Unmanic; prüfe
  Benutzername und Passwort in der Konfiguration.
- **„Kein Unmanic-Server unter dieser Adresse“**: Eine andere Anwendung
  antwortet auf diesem Port, oder der Pfad des Reverse-Proxys fehlt.
- **Kein Worker**: Unmanic hat keinen Worker, solange keine Worker-Gruppe
  einen hat (**Settings** → **Workers**).
- **Der Fortschritt bleibt bei 0 %**: Das Plugin der Aufgabe meldet Unmanic
  keinen Fortschritt; der Worker wird trotzdem mit seiner Datei als aktiv
  angezeigt.
- **Der Schalter tut nichts**: Aktiviere **Pause und Fortsetzen erlauben** in
  der Konfiguration.
- Mehr Details in den Protokollen der Integration (**Integrationen** →
  Unmanic → Protokolle), bei Bedarf auf der Stufe `debug`.

## Grenzen

- Ein Unmanic-Server pro Integration.
- Die Werte werden in jedem Aktualisierungsintervall gelesen: Eine kurze
  Aufgabe kann zwischen zwei Abfragen beginnen und enden (sie zählt trotzdem
  zu den Aufgaben des Tages).
- Die Aufgaben des Tages werden aus den 250 neuesten Aufgaben des Verlaufs
  gezählt, ab Mitternacht in der Zeitzone von Gladys. **Unmanic-Aufgabe
  fehlgeschlagen** meldet höchstens zehn Aufgaben pro Abfrage, keine älter als
  eine Stunde.
- Unmanic hat keine Authentifizierung: Jedes Gerät in deinem Netzwerk erreicht
  seine API. Die Integration ändert weder Einstellungen noch Bibliotheken oder
  Plugins von Unmanic und löscht nichts.
- Nicht mit Unmanic oder seinen Autoren verbunden.
