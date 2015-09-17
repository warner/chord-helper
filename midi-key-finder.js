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

var notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var flats = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

var all_modes = [
    ["ionian", [0,2,4,5,7,9]],
    ["dorian", [0,2,3,5,7,9,10]],
    ["phrygian", [0,1,3,5,7,8,10]],
    ["lydian", [0,2,4,6,7,9,11]],
    ["mixolydian", [0,2,4,5,7,9,10]],
    ["aeolian", [0,2,3,5,7,8,10]],
    ["locrian", [0,1,3,5,6,8,10]]
];

var current_scale_root = 0;
var current_scale_mode = 0;

function create_scale() {
    var t = d3.select("table#scale");
    var row0 = t.append("tr");
    var scale = all_modes[current_scale_mode];
    var degrees = row0.selectAll("td.degree").data(scale[1])
            .enter().append("td")
            .attr("class", "degree")
            .text(function(d) {return "deg"+d;})
    ;
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
        var note = notes[i];
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
    draw_scoreboard();
}

main();
