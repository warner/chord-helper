var d3; // defined by import
var midi = null;  // global MIDIAccess object

function MIDIMessageEventHandler(event) {
    var str = "MIDI message rx: ";
    for (var i=0; i<event.data.length; i++) {
        str += "0x" + event.data[i].toString(16) + " ";
    }
    //console.log( str );

    // Mask off the lower nibble (MIDI channel, which we don't care about)
    switch (event.data[0] & 0xf0) {
    case 0x90:
        if (event.data[2]!=0) {  // if velocity != 0, this is a note-on message
            noteOn(event.data[1]);
            return;
        }
        // if velocity == 0, fall thru: it's a note-off.  MIDI's weird, y'all.
    case 0x80:
        noteOff(event.data[1]);
        return;
    }
}

function noteOn(noteNumber) {
    console.log("note on: "+noteNumber);
    var note = noteNumber % 12; // 0=C, 2=D, .. 12=B
    d3.select("td.note-"+note).attr("class", "note-on note-name note-"+note);
}
function noteOff(noteNumber) {
    console.log("note off: "+noteNumber);
    var note = noteNumber % 12; // 0=C, 2=D, .. 12=B
    d3.select("td.note-"+note).attr("class", "note-name note-"+note);
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

function onMIDISuccess( midiAccess ) {
    status("MIDI ready!");
    midi = midiAccess;
    listInputsAndOutputs(midiAccess);
    startLoggingMIDIInput(midiAccess);
}

function onMIDIFailure(msg) {
    status( "Failed to get MIDI access - " + msg);
}

function try_midi() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then( onMIDISuccess, onMIDIFailure );
    } else {
        status("browser lacks navigator.requestMIDIAccess");
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
    ["Ionian", [0,2,4,5,7,9,11]], // major
    ["Dorian", [0,2,3,5,7,9,10]],
    ["Phrygian", [0,1,3,5,7,8,10]],
    ["Lydian", [0,2,4,6,7,9,11]],
    ["Mixolydian", [0,2,4,5,7,9,10]], // dominant
    ["Aeolian", [0,2,3,5,7,8,10]], // natural minor
    ["Locrian", [0,1,3,5,6,8,10]]
];

var current_scale_root = 2;
var current_scale_mode = 5;

function doubled_offsets(mode_num) {
    var mode = all_modes[mode_num];
    var mode_offsets = []; // doubled
    mode[1].forEach(function(offset) { mode_offsets.push(0+offset); });
    mode[1].forEach(function(offset) { mode_offsets.push(12+offset); });
    return mode_offsets;
}

function root_to_chord_data(r) {
    var mode = all_modes[current_scale_mode];
    console.log("root_to_chord_data", mode, r);
    var mode_offsets = doubled_offsets(current_scale_mode);
    mode[1].forEach(function(offset) { mode_offsets.push(0+offset); });
    mode[1].forEach(function(offset) { mode_offsets.push(12+offset); });
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
                if (ionian.indexOf(d) != -1) {
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

function update_scale() {
    var mode = all_modes[current_scale_mode];
    var text = "key/mode: "+note_names[current_scale_root]+" "+mode[0];
    d3.select("table#scale td.key-name").text(text);
    var t = mode[1].map(function(offset) {
        return (current_scale_root+offset)%12;
    });
    console.log("t", t);
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
        .attr("class", "note")
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

function expand_mode(mode) {
    // given e.g. (Ionioan) [0,2,4,5,7,9,11], return
    // [0,1,2,3,4,"-",5,6,7,8,9,10,11,"="]
    var out = [];
    for (var i=0; i < 6; i++) {
        out.push(mode[i]);
        if (mode[i+1] == mode[i]+1)
            out.push("-");
        else
            out.push(mode[i]+1);
    }
    out.push(mode[6]);
    if (mode[6] == 11)
        out.push("-");
    else
        out.push(11);
    return out;
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
            data.push({degree_str: "-", note_str: "", note: ""});
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
                {degree_str: "-", note_str: "", note: "-"},
                {degree_str: "3", note_str: "F", note: 5},
                {degree_str: "+", note_str: "F#", note: 6},
                {degree_str: "4", note_str: "G", note: 7},
                {degree_str: "+", note_str: "G#", note: 8},
                {degree_str: "5", note_str: "A", note: 9},
                {degree_str: "-", note_str: "", note: "-"},
                {degree_str: "6", note_str: "A#", note: 10},
                {degree_str: "+", note_str: "B", note: 11},
                {degree_str: "7", note_str: "C", note: 0},
                {degree_str: "+", note_str: "C#", note: 1}
               ];*/
    console.log(JSON.stringify(data));
    var chords = [0,1,2,3,4,5,6].map(root_to_chord_data);
    /*var chords2 = [{name: "i", notes: [2,5,9]},
                  {name: "ii0", notes: [4,7,10]},
                  {name: "III", notes: [5,9,0]},
                  {name: "iv", notes: [7,10,2]},
                  {name: "v", notes: [9,0,4]},
                  {name: "VI", notes: [10,2,5]},
                  {name: "VII", notes: [0,4,7]}
                 ];*/
    console.log(JSON.stringify(chords));
                  
    d3.selectAll("table#chords tr.degree td.degree").data(data)
        .text(function(d) { return d.degree_str; })
        .attr("class", function(d) {
            var degree = d.degree_str;
            if (degree == "-")
                return "not-degree";
            if (degree == "+")
                return "degree not-in-scale";
            return "degree degree-in-scale scale-degree-"+degree;
        });
    d3.selectAll("table#chords tr.note td.note").data(data)
        .text(function(d) { return d.note_str; })
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
                return "chord-node scale-degree-"+d.degree_str;
            })
        ;
    });
}


function draw_scoreboard() {
    var t = d3.select("table#scoreboard");
    var row0 = t.append("tr");
    row0.append("th"); // corner
    row0.append("th").text("Key Name")
        .attr("colspan", keys.length)
        .attr("class", "key-name-header");
    var row1 = t.append("tr");
    row1.append("th").text("note").attr("class", "note-name-header");
    keys.forEach(function(key) {
        row1.append("th").text(key[0]).attr("class", "key-name-header");
    });
    for (var i=0; i < 12; i++) {
        var note = note_names[i];
        var row = t.append("tr");
        row.append("td").text(note).attr("class", "note-name note-"+i);
        keys.forEach(function(key) {
            row.append("td").text(key[0]+"-"+note)
                .attr("class", "fitness fitness-"+key[0]+"-"+note);
        });
    }
    return;
    var chords = [
        ["I", [1,3,5], ""],
        ["ii", [2,4,6], "m"],
        ["iii", [3,5,7], "m"],
        ["IV", [4,6,1], ""],
        ["V", [5,7,2], ""],
        ["vi", [6,1,3], "m"],
    ];
    var w = 50;
    d3.select("div#chord svg").remove();
    var svg = d3.select("div#chord").append("svg");
    svg.attr("height", 100).attr("width", chords.length*w);
    var groups = svg.selectAll("g.chord").data(chords)
            .enter().append("svg:g")
            .attr("class", "scale")
            .attr("transform", function(d,i) {
                var x = i*w;
                return "translate("+x+",0)";
            })
            .on("click", select_chord)
    ;
    var rects = groups.append("svg:rect")
            .attr("class", function(d) {return "chord-indicator "
                                        +"chord-indicator-"+d[0];})
            .attr("height", "1.2em")
            .attr("width", function(d) {
                return (1 + 0.5*(d[1].length-1) + "em");
            })
            .attr("fill", function(d){return major_scale_colors[d[1][0]];})
            .attr("stroke-width", "2px")
    ;
    groups.append("svg:text")
        .attr("class", "chord-buttons")
        .text(function(d) {return d[0];})
        .attr("text-anchor", "middle")
        .attr("dy", "1.0em").attr("dx", "1em")
    ;
    groups.append("svg:text")
        .attr("class", "chord-roots")
        .text("??")
        .attr("text-anchor", "middle")
        .attr("dy", "2.2em").attr("dx", "1em")
    ;
    groups.append("svg:text")
        .attr("class", "chord-quality")
        .text("?")
        .attr("text-anchor", "middle")
        .attr("dy", "3.4em").attr("dx", "1em")
    ;
}

function main() {
    try_midi();
    create_scale();
    update_scale();
    draw_scoreboard();
    create_chords();
    update_chords();
}

main();
