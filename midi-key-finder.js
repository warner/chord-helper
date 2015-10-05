var d3; // defined by import
var midi = null;  // global MIDIAccess object
var audio = {
    context: null,
    oscillator: null,  // the single oscillator
    envelope: null,    // the envelope for the single oscillator
    volume: 0.2,
    attack: 0.05,      // attack speed
    release: 0.05,   // release speed
    portamento: 0.005,  // portamento/glide speed
    activeNotes: [] // the stack of actively-pressed keys
};
var sound_on = true;

// example copied from http://webaudio.github.io/web-midi-api/
function createAudioContext() {
    var context = audio.context = new AudioContext();
    // set up the basic oscillator chain, muted to begin with.
    audio.oscillator = context.createOscillator();
    audio.oscillator.frequency.setValueAtTime(110, 0);
    audio.envelope = context.createGain();
    audio.oscillator.connect(audio.envelope);
    audio.envelope.connect(context.destination);
    audio.envelope.gain.value = 0.0;  // Mute the sound
    audio.oscillator.start(0);  // Go ahead and start up the oscillator
}

function frequencyFromNoteNumber( note ) {
    return 440 * Math.pow(2,(note-69)/12);
}

function playOn(noteNumber) {
    audio.activeNotes.push( noteNumber );
    audio.oscillator.frequency.cancelScheduledValues(0);
    var freq = frequencyFromNoteNumber(noteNumber);
    audio.oscillator.frequency.setTargetAtTime(freq, 0, audio.portamento );
    audio.envelope.gain.cancelScheduledValues(0);
    audio.envelope.gain.setTargetAtTime(audio.volume, 0, audio.attack);
}

function playOff(noteNumber) {
    var position = audio.activeNotes.indexOf(noteNumber);
    if (position!=-1) {
        audio.activeNotes.splice(position,1);
    }
    if (audio.activeNotes.length==0) {  // shut off the envelope
        audio.envelope.gain.cancelScheduledValues(0);
        audio.envelope.gain.setTargetAtTime(0.0, 0, audio.release );
    } else {
        audio.oscillator.frequency.cancelScheduledValues(0);
        var freq = frequencyFromNoteNumber(audio.activeNotes[audio.activeNotes.length-1]);
        audio.oscillator.frequency.setTargetAtTime(freq, 0, audio.portamento);
      }
}

function changeVolume(e) {
    audio.volume = this.value / 100;
}


function MIDIMessageEventHandler(event) {
    var str = "MIDI message rx: ";
    for (var i=0; i<event.data.length; i++) {
        str += "0x" + event.data[i].toString(16) + " ";
    }
    //console.log( str );

    // Mask off the lower nibble (MIDI channel, which we don't care about)
    switch (event.data[0] & 0xf0) {
    case 0x90:
        if (event.data[2]!==0) {  // if velocity != 0, this is a note-on message
            noteOn(event.data[1]);
            return;
        }
        // if velocity == 0, fall thru: it's a note-off.  MIDI's weird, y'all.
    case 0x80:
        noteOff(event.data[1]);
        return;
    }
}

var scores = {};
var recording = true;

function noteOn(noteNumber) {
    //console.log("note on: "+noteNumber);
    if (sound_on)
        playOn(noteNumber);
    var note = noteNumber % 12; // 0=C, 2=D, .. 12=B
    d3.selectAll("td.note-"+note).classed("note-on", true);
    if (recording)
        add_note_to_score(note);
}
function noteOff(noteNumber) {
    //console.log("note off: "+noteNumber);
    playOff(noteNumber);
    var note = noteNumber % 12; // 0=C, 2=D, .. 12=B
    d3.selectAll("td.note-"+note).classed("note-on", false);
}

function startLoggingMIDIInput( midiAccess ) {
    midiAccess.inputs.forEach( function(entry) {
        entry.onmidimessage = MIDIMessageEventHandler;
    });
}        

function listInputsAndOutputs( midiAccess ) {
  for (var entry of midiAccess.inputs) {
    var input = entry[1];
    console.log("Input port [type:'" + input.type + "'] id:'" + input.id +
      "' manufacturer:'" + input.manufacturer + "' name:'" + input.name +
      "' version:'" + input.version + "'" );
  }
}

function status(msg) {
    d3.select("div#status").text(msg);
    console.log(msg);
}

var instructions = "Play virtual keyboard: ASDFGHJK = CDEFGABC, WE=C#D#, TYU=F#G#A#.";

function onMIDISuccess( midiAccess ) {
    status("MIDI ready! "+instructions+" Or play MIDI keyboard.");
    midi = midiAccess;
    listInputsAndOutputs(midiAccess);
    startLoggingMIDIInput(midiAccess);
    try_linnstrument();
}

function onMIDIFailure(msg) {
    status(instructions+" (failed to get MIDI access - " + msg+")");
}

function try_midi() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then( onMIDISuccess, onMIDIFailure );
    } else {
        status(instructions+" (browser lacks navigator.requestMIDIAccess)");
    }
}

// we can set the colors of the LinnStrument keyboard matrix over MIDI
// x=0 is the control-key column, x=1 is the left play column, x=25 right
// y=0 is the bottom row, y=7 is the top
var LIcolors = {
    default: 0,
    red: 1,
    yellow: 2,
    green: 3,
    cyan: 4,
    blue: 5,
    magenta: 6,
    off: 7
};
function LIsetColor(output,x,y,color) {
    output.send( [0xb0, 0x14, x] );
    output.send( [0xb0, 0x15, y] );
    output.send( [0xb0, 0x16, LIcolors[color]] );
}

function LIsetAllColors(output, color) {
    for (var x=0; x <= 25; x++) {
        for (var y=0; y <= 7; y++) {
            var c = color;
            if (typeof(color) == "function")
                c = color(x,y);
            //console.log(x,y,c);
            LIsetColor(output,x,y,c);
        }
    }
}

function LIfindOutput() {
    for (var o of midi.outputs) {
        if (o[1].name == "LinnStrument MIDI")
            return o[1];
    }
}

function try_linnstrument() {
    var o = LIfindOutput();
    if (o)
        d3.select("button#reset-lights").style("visibility", "visible");
}

function LInoteForButton(x,y) {
    if (x==0)
        return -1; // control-key column
    var noteNumber = 0x1e; // 0,0 is MIDI 0x1e, which is G0
    noteNumber += (x-1);
    noteNumber += 5*y;
    return noteNumber;
}

// map virtual keyboard: ASDFGHJK = CDEFGABC, WE=C#D#, TYU=F#G#A#
var virtual_keyboard_notes = {
    65: 0, // A -> C
    87: 1, // W -> C#
    83: 2, // S -> D
    69: 3, // E -> D#
    68: 4, // D -> E
    70: 5, // F -> F
    84: 6, // T -> F#
    71: 7, // G -> G
    89: 8, // Y -> G#
    72: 9, // H -> A
    85: 10, // U -> A#
    74: 11, // J -> B
    75: 12 // K -> C
};

function handle_keydown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;
    var noteNumber = virtual_keyboard_notes[e.keyCode];
    if (noteNumber !== undefined) {
        noteOn(5*12+noteNumber);
    }
}

function handle_keyup(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;
    var noteNumber = virtual_keyboard_notes[e.keyCode];
    if (noteNumber !== undefined) {
        noteOff(5*12+noteNumber);
    }
}

function major(start) {
    return [0,2,4,5,7,9,11].map(function(offset) { return start+offset; });
}

var keys = [
    ["C", major(0)],
    ["D", major(2)],
    ["E", major(4)],
    ["F", major(5)],
    ["G", major(7)]
];

var note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G","G#","A","A#","B"];
var flats = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

var all_modes = [
    ["Ionian (major)", [0,2,4,5,7,9,11]], // major
    ["Dorian", [0,2,3,5,7,9,10]],
    ["Phrygian", [0,1,3,5,7,8,10]],
    ["Lydian", [0,2,4,6,7,9,11]],
    ["Mixolydian (dominant)", [0,2,4,5,7,9,10]], // dominant
    ["Aeolian (minor)", [0,2,3,5,7,8,10]], // natural minor
    ["Locrian", [0,1,3,5,6,8,10]],
    ["diminished", [0,1,3,4,6,7,9,10]],
    ["Hungarian minor", [0,2,3,6,7,8,11]], // Pink Panther = A
    ["minor blues", [0,3,5,6,7,10]],
    ["minor pentatonic", [0,3,5,7,10]],
    ["major pentatonic", [0,2,4,7,9]],
];

var current_scale_root = 2;
var current_scale_mode = 5;

function LIlightScale() {
    if (!midi) {
        console.log("LIlightScale: no midi");
        return;
    }
    var output = LIfindOutput();
    if (!LIfindOutput) {
        console.log("LIlightScale: no LinnStrument");
        return;
    }
    var scale = all_modes[current_scale_mode][1].map(function(offset) {
        return (current_scale_root + offset) % 12;
    });
    LIsetAllColors(output, function(x,y) {
        var noteNumber = LInoteForButton(x,y);
        if (noteNumber == -1)
            return "default"; // control-key row: leave at default
        var note = noteNumber % 12;
        var note_type = "not";
        if (note == current_scale_root)
            note_type = "tonic";
        else if (scale.indexOf(note) != -1)
            note_type = "scale";

        // mark center-C3 with red, even when it's not in the scale
        var center = "";
        if (x == 11 && y == 4)
            center = "-center";

        var colors = {
            "tonic": "cyan",
            "scale": "green",
            "not": "off",
            "tonic-center": "magenta", // blue+red
            "scale-center": "yellow", // green+red
            "not-center": "red" // off+red
        };
        return colors[note_type+center];
    });
}

function reset_scores() {
    for (var root=0; root < 12; root++) {
        all_modes.forEach(function(mode, mode_num) {
            scores[mode_num+"-"+root] = 0;
        });
    }
    d3.selectAll("td.fitness")
        .classed("selected", false)
        .text("0")
        .attr("style", "")
    ;
}

function record_scores() {
    recording = true;
    d3.select("button#record-scores")
        .classed("highlighted", true)
        .text("Recording");
    d3.select("button#pause-scores")
        .classed("highlighted", false)
        .text("pause");
}
function pause_scores() {
    recording = false;
    d3.select("button#record-scores")
        .classed("highlighted", false)
        .text("record");
    d3.select("button#pause-scores")
        .classed("highlighted", true)
        .text("Paused");
}

function interpolate_color(half_value, min_color, max_color) {
    var color = [0,1,2].map(function(chan) {
        var r256 = (max_color[chan]-min_color[chan])*2*half_value + min_color[chan];
        var hex = Math.floor(r256).toString(16);
        if (hex.length == 1)
            hex = "0" + hex;
        //console.log(r256, hex);
        return hex;
    });
    return color;
}

function score_to_color(score, min, max) {
    var where = (score-min) / (max-min);
    var color;
    if (where < 0.5)
        color = interpolate_color(0.5-where, [255,255,255], [255,128,128]);
    else
        color = interpolate_color(where-0.5, [255,255,255], [128,255,128]);
    var rgb = "#" + color[0] + color[1] + color[2];
    //console.log(score, min, max, rgb);
    return rgb;
}

function add_note_to_score(note) {
    var min_score = 0;
    var max_score = 0;
    for (var root=0; root < 12; root++) {
        all_modes.forEach(function(mode, mode_num) {
            var name = mode_num+"-"+root;
            var in_scale = false;
            mode[1].forEach(function(offset) {
                if ((root+offset)%12 == note)
                    in_scale = true;
            });
            if (note == root)
                scores[name] += 2;
            else if (in_scale)
                scores[name] += 1;
            else
                scores[name] -= 5;
            if (scores[name] > max_score)
                max_score = scores[name];
            if (scores[name] < min_score)
                min_score = scores[name];
        });
    }
    for (root=0; root < 12; root++) {
        all_modes.forEach(function(mode,mode_num) {
            var name = mode_num+"-"+root;
            var color = score_to_color(scores[name], min_score, max_score);
            d3.select("td.fitness-"+name)
                .text(scores[name])
                .attr("style", "background-color: "+color)
            ;
        });
    }
}

function doubled_offsets(mode_num) {
    var mode = all_modes[mode_num];
    var mode_offsets = []; // doubled
    mode[1].forEach(function(offset) { mode_offsets.push(0+offset); });
    mode[1].forEach(function(offset) { mode_offsets.push(12+offset); });
    return mode_offsets;
}

function root_to_chord_data(r) {
    var mode = all_modes[current_scale_mode];
    //console.log("root_to_chord_data", mode, r);
    var mode_offsets = doubled_offsets(current_scale_mode);
    var root = mode_offsets[r+0];
    var off2 = mode_offsets[r+2]-root;
    var off3 = mode_offsets[r+4]-root-off2;
    var name = ["i","ii","iii","iv","v","vi","vii"][r];
    // for diatonic modes, we either get major, minor, or diminished
    if (off2 == 4 && off3 == 3)
        name = name.toUpperCase(); // major
    else if (off2 == 3 && off3 == 4)
        name = name.toLowerCase(); // minor
    else if (off2 == 3 && off3 == 3)
        name = name.toLowerCase() + "0"; // diminished
    else
        name = name.toLowerCase() +"?!?"; // oops
    var notes = [(current_scale_root+mode_offsets[r+0])%12,
                 (current_scale_root+mode_offsets[r+2])%12,
                 (current_scale_root+mode_offsets[r+4])%12];
    return {name: name, notes: notes};
}
    
/*
   |     | mode    |        |          |    |    |
   | key | Ionian  | Dorian | Phrygian | .. | .. |
   | C   | (score) |        |          |    |    |
   | D.. |         |        |          |    |    |
 */

function create_scoreboard() {
    var t = d3.select("table#scoreboard");
    var row0 = t.append("tr");
    row0.append("th"); // corner
    row0.append("th").text("mode")
        .attr("colspan", all_modes.length)
        .attr("class", "mode-name-header");
    var row1 = t.append("tr");
    row1.append("th").text("key").attr("class", "note-name-header");
    all_modes.forEach(function(mode) {
        row1.append("th").text(mode[0]).attr("class", "mode-name-header");
    });
    for (var root=0; root < 12; root++) {
        var note = note_names[root];
        var row = t.append("tr");
        row.append("td").text(note).attr("class", "note-name note-"+note);
        all_modes.forEach(function(mode, mode_num) {
            var name = mode_num+"-"+root;
            row.append("td")
                .datum({mode: mode_num, root: root})
                .text(0)
                .attr("class", "fitness fitness-"+name)
                .on("click", select_scale)
            ;
        });
    }
}

function select_scale(d) {
    var name = d.mode+"-"+d.root;
    console.log("select_scale", all_modes[d.mode][0]+"-"+d.root,
                note_names[d.root], all_modes[d.mode][0]);
    d3.selectAll("td.fitness").classed("selected", false);
    d3.select("td.fitness-"+name).classed("selected", true);
    current_scale_mode = d.mode;
    current_scale_root = d.root;
    update_scale();
    update_chords();
}

/*
*** "key: D Aeolian (minor)"
    | C | C# | D | D# | E | F | F# | G | G# | A | A# | B | (fixed) |
    | 7 |    | 1 |    | 2 | 3 |    | 4 |    | 5 |  6 |   | (var)   |
 */

function create_scale() {
    var t = d3.select("table#scale");
    var row0 = t.append("tr");
    row0.append("td").attr("class", "key-name")
        .attr("colspan", "12")
        .text("??");
    var range = [0,1,2,3,4,5,6,7,8,9,10,11];
    var row1 = t.append("tr");
    var ionian = all_modes[0][1];
    var notes = row1.selectAll("td")
            .data(range)
            .enter().append("td")
            .text(function(d) {return note_names[d];})
            .attr("class", function(d) {
                if (ionian.indexOf(d) !== -1) {
                    return "note in-scale";
                } else {
                    return "note not-in-scale";
                }
            })
    ;
    var row2 = t.append("tr");
    row2.selectAll("td.degreenote").data(range)
        .enter().append("td").attr("class", "degree")
        .text("??")
    ;
}

function render_sharps_flats(mode, root) {
    var sig = "";
    // Start by assuming all black keys are sharps. Then for each black key,
    // see if the same-lettered white key is also in the scale. If so, then
    // all black keys must be flats.
    var notes = mode[1].map(function(offset) { return (root+offset)%12; });
    var black_keys = [1,3,6,8,10];
    var pairs = [ [0,1], [2,3], [5,6], [7,8], [9,10] ];
    var sig_type = "#";
    for (var i=0; i<pairs.length; i++) {
        if ((notes.indexOf(pairs[i][0]) != -1) &&
            (notes.indexOf(pairs[i][1]) != -1))
            sig_type = "b";
    }
    for (i=0; i<black_keys.length; i++) {
        if (notes.indexOf(black_keys[i]) != -1)
            sig = sig + sig_type;
    }
    // TODO: this gets Gb/F# wrong (should be 6b or 6#, gives 5b)
    // note sure about anything but Ionian/Aeolian (major/minor)
    return sig;
}

function update_scale() {
    var mode = all_modes[current_scale_mode];
    var text = "key/mode: "+note_names[current_scale_root]+" "+mode[0];
    text += " ("+render_sharps_flats(mode, current_scale_root)+")";
    d3.select("table#scale td.key-name").text(text);
    var t = mode[1].map(function(offset) {
        return (current_scale_root+offset)%12;
    });
    //console.log("t", t);
    d3.selectAll("table#scale td.degree")
        .text(function(d) {
            var i = t.indexOf(d);
            if (i == -1) {
                return "";
            } else {
                return i+1;
            }
        })
        .attr("class", function(d) {
            var i = t.indexOf(d);
            if (i == -1) {
                return "degree not-in-scale";
            } else {
                return "degree scale-degree-"+(i+1);
            }
        })
    ;
    LIlightScale();
}

/*
   | degree | 1 | +  | 2 | - | 3 | +  | 4 | +  | 5 | - | 6  | + | 7 | +  |
   | note   | D | D# | E |   | F | F# | G | G# | A |   | A# | B | C | C# |
   | -      | - | -  | - | - | - | -  | - | -  | - | - | -  | - | - | -  |
   | i      | D |    |   |   | F |    |   |    | A |   |    |   |   |    |
   | ii0    |   |    | E |   |   |    | G |    |   |   | A# |   |   |    |
   | III    |   |    |   |   | F |    |   |    | A |   |    |   | C |    |
   | etc..  |   |    |   |   |   |    |   |    |   |   |    |   |   |    |
*** degree labels are fixed, but have spaces that may or may not be used
**** e.g. major scale leaves 3+/7+ unused, but for minor it's 2+/7+
**** spaces that are used represent out-of-scale notes
**** spaces that aren't used are not notes, and the whole column will be
     empty, and needs to be colored/styled to indicate that
*** note labels are sparse
*** chord note labels are in fixed positions, under the degree labels
 */

function create_chords() {
    var t = d3.select("table#chords");
    var range = [0,1,2,3,4,5,6,7,8,9,10,11,12,13];
    //var degrees = ["1","", "2","", "3", "4","", "5","", "6","", "7"];
    var row0 = t.append("tr").attr("class", "degree");
    row0.append("td").text("degree");
    row0.selectAll("td.degree").data(range)
        .enter().append("td")
        .attr("class", "degree")
        .text(function(d) {return d;});
    var row1 = t.append("tr").attr("class", "note");
    row1.append("td").text("note");
    row1.selectAll("td.note").data(range)
        .enter().append("td")
        .attr("class", "note note-name")
        .text(function(d) {return d;});
    t.append("tr").append("td");
    [1,2,3,4,5,6,7].forEach(function(c) {
        var rowC = t.append("tr").attr("class", "chord").datum(c);
        rowC.append("td")
            .attr("class", "chord-name")
            .text(c);
        rowC.selectAll("td.chord-note").data(range)
            .enter().append("td")
            .attr("class", "chord-note")
            .text("?");
    });
}

function update_chords() {
    var mode = all_modes[current_scale_mode];
    var mode_offsets = doubled_offsets(current_scale_mode);
    var data = []; // will be 14 columns wide
    for (var degree=0; degree < 7; degree++) {
        var note = (current_scale_root + mode_offsets[degree])%12;
        data.push({degree_str: ""+(degree+1),
                   note: note,
                   note_str: note_names[note]});
        if (mode_offsets[degree+1] == mode_offsets[degree]+1) {
            data.push({degree_str: "", note_str: "", note: ""});
        } else {
            var next_note = (current_scale_root + mode_offsets[degree]+1)%12;
            data.push({degree_str: "+",
                       note: next_note,
                       note_str: note_names[next_note]});
        }
    }
    /*var data2 = [{degree_str: "1", note_str: "D", note: 2},
                {degree_str: "+", note_str: "D#", note: 3},
                {degree_str: "2", note_str: "E", note: 4},
                {degree_str: "", note_str: "", note: ""},
                {degree_str: "3", note_str: "F", note: 5},
                {degree_str: "+", note_str: "F#", note: 6},
                {degree_str: "4", note_str: "G", note: 7},
                {degree_str: "+", note_str: "G#", note: 8},
                {degree_str: "5", note_str: "A", note: 9},
                {degree_str: "", note_str: "", note: ""},
                {degree_str: "6", note_str: "A#", note: 10},
                {degree_str: "+", note_str: "B", note: 11},
                {degree_str: "7", note_str: "C", note: 0},
                {degree_str: "+", note_str: "C#", note: 1}
               ];*/
    //console.log(JSON.stringify(data));
    var chords = [0,1,2,3,4,5,6].map(root_to_chord_data);
    /*var chords2 = [{name: "i", notes: [2,5,9]},
                  {name: "ii0", notes: [4,7,10]},
                  {name: "III", notes: [5,9,0]},
                  {name: "iv", notes: [7,10,2]},
                  {name: "v", notes: [9,0,4]},
                  {name: "VI", notes: [10,2,5]},
                  {name: "VII", notes: [0,4,7]}
                 ];*/
    //console.log(JSON.stringify(chords));
                  
    d3.selectAll("table#chords tr.degree td.degree").data(data)
        .text(function(d) { return d.degree_str; })
        .attr("class", function(d) {
            var s = d.degree_str;
            if (s == "")
                s = "non-degree";
            return "degree scale-degree-"+s;
        });
    d3.selectAll("table#chords tr.note td.note").data(data)
        .text(function(d) { return d.note_str; })
        .attr("class", function(d) {
            var s = "note note-name";
            if (d.note !== "")
                s += " note-"+d.note;
            return s;
        })
    ;
    d3.selectAll("table#chords tr.chord").data(chords).each(function(d,i) {
        var row = d3.select(this); // the row
        var chord = d;
        row.select("td.chord-name").text(chord.name);
        row.selectAll("td.chord-note").data(data)
            .text(function(d) {
                if (chord.notes.indexOf(d.note) == -1)
                    return "";
                return d.note_str;
            })
            .attr("class", function(d) {
                if (chord.notes.indexOf(d.note) == -1)
                    return "chord-note";
                return "chord-note scale-degree-"+d.degree_str;
            })
        ;
    });
}

function attach_buttons() {
    d3.select("button#reset-scores").on("click", reset_scores);
    d3.select("button#record-scores").on("click", record_scores);
    d3.select("button#pause-scores").on("click", pause_scores);
    d3.select("button#reset-lights").on("click", function(e) {
        LIsetAllColors(LIfindOutput(), "default");
    });
    //d3.select("div#status").on("keydown", handle_keydown);
    //d3.select("div#status").on("keyup", handle_keyup);
    window.onkeyup = handle_keyup;
    window.onkeydown = handle_keydown;
    d3.select("input#volume").on("change", changeVolume);
}

function main() {
    createAudioContext();
    d3.select("button#reset-lights").style("visibility", "hidden");
    try_midi();
    create_scale();
    update_scale();
    create_scoreboard();
    reset_scores();
    create_chords();
    update_chords();
    attach_buttons();
}

main();
